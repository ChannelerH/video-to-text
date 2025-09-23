import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users, transcriptions, orders } from '@/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import Stripe from 'stripe';
import { getCurrentSubscriptionOrder } from '@/services/user-subscription';

export const runtime = 'nodejs';

function makeStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY || '';
  if (!key) throw new Error('stripe-key-missing');
  return new Stripe(key);
}

export async function GET(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json(
        { eligible: false, reason: 'Unauthorized' },
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
        { eligible: false, reason: 'User not found' },
        { status: 404 }
      );
    }

    const subscriptionStatus = (user as any).subscription_status;

    const activeOrder = await getCurrentSubscriptionOrder(userUuid);
    const subscriptionId = activeOrder?.sub_id ? String(activeOrder.sub_id) : null;

    if (!subscriptionId || subscriptionStatus === 'free') {
      return NextResponse.json({
        eligible: false,
        reason: 'No active subscription'
      });
    }

    // 3. 获取订阅信息
    const stripe = makeStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // 4. 计算订阅时长
    const daysSinceStart = Math.floor(
      (Date.now() - subscription.current_period_start * 1000) / (1000 * 60 * 60 * 24)
    );

    // 5. 获取使用统计
    const startOfPeriod = new Date(subscription.current_period_start * 1000);
    const startOfPeriodIso = startOfPeriod.toISOString();
    const usageStats = await db()
      .select({
        totalTranscriptions: sql<number>`COUNT(*)`,
        totalMinutes: sql<number>`COALESCE(SUM(${transcriptions.cost_minutes}), 0)`
      })
      .from(transcriptions)
      .where(
        and(
          eq(transcriptions.user_uuid, userUuid),
          sql`${transcriptions.created_at} >= ${startOfPeriodIso}`
        )
      );

    const usage = usageStats[0];

    // 6. 退款资格规则
    const eligible = daysSinceStart <= 7 && Number(usage.totalMinutes) < 10;

    // 7. 获取最近账单金额（以 Stripe invoice 为准）
    let amount = 0;
    let currency = 'usd';
    try {
      if (subscription.latest_invoice) {
        const invoice = await stripe.invoices.retrieve(subscription.latest_invoice as string);
        amount = (invoice.amount_paid || 0) / 100;
        currency = invoice.currency || 'usd';
      } else {
        const invoices = await stripe.invoices.list({ customer: subscription.customer as string, subscription: subscription.id, limit: 1 });
        const inv = invoices.data?.[0];
        if (inv) { amount = (inv.amount_paid || 0) / 100; currency = inv.currency || 'usd'; }
      }
    } catch {}

    return NextResponse.json({
      eligible,
      daysSinceStart,
      minutesUsed: Number(usage.totalMinutes),
      transcriptionCount: Number(usage.totalTranscriptions),
      refundAmount: eligible ? amount : 0,
      currency,
      reason: eligible 
        ? 'Eligible for refund' 
        : daysSinceStart > 7 
          ? 'Subscription older than 7 days'
          : 'Usage exceeds refund limit'
    });

  } catch (error) {
    console.error('[Refund] Eligibility check error:', error);
    return NextResponse.json(
      { eligible: false, reason: 'Failed to check eligibility' },
      { status: 500 }
    );
  }
}
