import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users, transcriptions, refunds } from '@/db/schema';
import { getCurrentSubscriptionOrder, syncUserSubscriptionTier } from '@/services/user-subscription';
import { eq, and, sql } from 'drizzle-orm';
import Stripe from 'stripe';

export const runtime = 'nodejs';

function makeStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY || '';
  if (!key) throw new Error('stripe-key-missing');
  return new Stripe(key);
}

export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. 获取用户信息
    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.uuid, userUuid))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const stripeCustomerId = (user as any).stripe_customer_id;
    const activeOrder = await getCurrentSubscriptionOrder(userUuid);
    const subscriptionId = activeOrder?.sub_id ? String(activeOrder.sub_id) : null;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'Stripe customer not found' },
        { status: 400 }
      );
    }

    // 3. 获取取消原因和反馈
    const { 
      reason, 
      feedback, 
      immediate = false,
      requestRefund = false 
    } = await request.json();

    // 4. 获取用户的使用统计（用于决定是否退款）
    // 4. 获取 Stripe 订阅，计算本周期开始时间
    const stripe = makeStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const periodStart = new Date(subscription.current_period_start * 1000);

    // 5. 获取"本计费周期内"的使用统计（与 eligibility 保持一致）
    const usageStats = await db()
      .select({
        totalTranscriptions: sql<number>`COUNT(*)`,
        totalMinutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)`
      })
      .from(transcriptions)
      .where(and(eq(transcriptions.user_uuid, userUuid), sql`${transcriptions.created_at} >= ${periodStart}`));

    const usage = usageStats[0];

    // 6. 取消订阅
    let updatedSub: Stripe.Response<Stripe.Subscription> | Stripe.Subscription;
    if (immediate) {
      // 立即取消
      updatedSub = await stripe.subscriptions.cancel(subscriptionId);
    } else {
      // 在周期结束时取消（推荐）
      updatedSub = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        metadata: {
          cancel_reason: reason,
          cancel_feedback: feedback || ''
        }
      });
    }

    // 7. 处理退款（如果请求且符合条件）
    let refundResult = null;
    if (requestRefund && (updatedSub as any).latest_invoice) {
      // 检查是否符合退款条件
      const daysSinceCharge = Math.floor(
        (Date.now() - subscription.current_period_start * 1000) / (1000 * 60 * 60 * 24)
      );
      
      // 退款规则：7天内且使用量少于10分钟
      if (daysSinceCharge <= 7 && Number(usage.totalMinutes) < 10) {
        try {
          // 获取最后一次付款
          const invoice = await stripe.invoices.retrieve((updatedSub as any).latest_invoice as string);
          if (invoice.payment_intent) {
            // 计算退款金额（可选：按比例退款）
            const totalAmount = invoice.amount_paid; // 总支付金额（分）
            
            // 选项1：全额退款（当前实现）
            const refundAmount = totalAmount;
            
            // 选项2：按未使用天数比例退款（注释掉的代码供参考）
            // const billingPeriodDays = Math.floor(
            //   (subscription.current_period_end - subscription.current_period_start) / (60 * 60 * 24)
            // );
            // const unusedDays = billingPeriodDays - daysSinceCharge;
            // const refundAmount = Math.floor((totalAmount * unusedDays) / billingPeriodDays);
            
            refundResult = await stripe.refunds.create({
              payment_intent: invoice.payment_intent as string,
              amount: refundAmount, // 指定退款金额（分）
              reason: 'requested_by_customer',
              metadata: {
                cancel_reason: reason,
                days_since_charge: daysSinceCharge.toString(),
                minutes_used: usage.totalMinutes.toString()
              }
            });

            // 写退款记录
            try {
              await db().insert(refunds).values({
                user_uuid: userUuid,
                stripe_payment_intent: String(invoice.payment_intent),
                amount_cents: refundAmount,
                currency: String(invoice.currency || 'usd'),
                reason: 'requested_by_customer',
                created_at: new Date()
              } as any);
            } catch {}
          }
        } catch (refundError) {
          console.error('[Subscription] Refund error:', refundError);
          // 退款失败不影响取消流程
        }
      }
    }

    // 8. 更新数据库（立即取消与周期结束时取消区分处理）
    if (immediate) {
      await db()
        .update(users)
        .set({
          subscription_state: 'cancelled',
          subscription_cancelled_at: new Date(),
          subscription_cancel_at_period_end: false,
          subscription_cancel_reason: reason,
          subscription_cancel_feedback: feedback,
          stripe_subscription_id: null,
          updated_at: new Date()
        } as any)
        .where(eq(users.uuid, userUuid));

      await syncUserSubscriptionTier({
        userUuid,
        stripeCustomerId: stripeCustomerId || undefined,
        stripe,
      });
    } else {
      await db()
        .update(users)
        .set({
          subscription_state: 'cancelling',
          subscription_cancel_at_period_end: true,
          subscription_cancel_reason: reason,
          subscription_cancel_feedback: feedback,
          updated_at: new Date()
        } as any)
        .where(eq(users.uuid, userUuid));

      await syncUserSubscriptionTier({
        userUuid,
        stripeCustomerId: stripeCustomerId || undefined,
        stripe,
      });
    }

    // 9. 记录取消事件
    console.log(`[Subscription] Cancelled for user ${userUuid}`, {
      reason,
      immediate,
      refunded: !!refundResult,
      usage: usage.totalMinutes
    });

    // 10. 发送取消确认邮件（可选）
    // await sendCancellationEmail(user.email, { reason, immediate });

    return NextResponse.json({
      success: true,
      message: immediate ? 'Subscription cancelled' : 'Subscription will cancel at period end',
      cancelAt: immediate ? new Date().toISOString() : new Date(updatedSub.current_period_end * 1000).toISOString(),
      refunded: !!refundResult,
      refundAmount: refundResult?.amount ? refundResult.amount / 100 : 0
    });

  } catch (error) {
    console.error('[Subscription] Cancel error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}

// 恢复取消（如果用户改变主意）
export async function DELETE(request: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.uuid, userUuid))
      .limit(1);

    const activeOrder = await getCurrentSubscriptionOrder(userUuid);
    const subscriptionId = activeOrder?.sub_id ? String(activeOrder.sub_id) : null;
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 400 }
      );
    }

    // 恢复订阅（取消"将要取消"状态）
    const stripe = makeStripe();
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });

    // 更新数据库
    await db()
      .update(users)
      .set({
        subscription_state: 'active',
        subscription_cancelled_at: null,
        subscription_cancel_reason: null,
        updated_at: new Date()
      } as any)
      .where(eq(users.uuid, userUuid));

    await syncUserSubscriptionTier({
      userUuid,
      stripeCustomerId: (user as any)?.stripe_customer_id || undefined,
      stripe,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription cancellation reversed'
    });

  } catch (error) {
    console.error('[Subscription] Resume error:', error);
    return NextResponse.json(
      { error: 'Failed to resume subscription' },
      { status: 500 }
    );
  }
}
