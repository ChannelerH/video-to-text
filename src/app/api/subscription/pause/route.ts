import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { getCurrentSubscriptionOrder, syncUserSubscriptionTier } from '@/services/user-subscription';

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

    // 2. 获取用户的 Stripe 信息
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

    if (!stripeCustomerId || !subscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription found' },
        { status: 400 }
      );
    }

    // 3. 获取请求参数
    const { duration = 30 } = await request.json(); // 默认暂停30天

    // 4. 暂停订阅
    const resumeDate = new Date();
    resumeDate.setDate(resumeDate.getDate() + duration);

    const stripe = makeStripe();
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: {
        behavior: 'mark_uncollectible',
        resumes_at: Math.floor(resumeDate.getTime() / 1000)
      }
    });

    // 5. 更新数据库
    await db()
      .update(users)
      .set({
        subscription_state: 'paused',
        subscription_paused_at: new Date(),
        subscription_resumes_at: resumeDate,
        updated_at: new Date()
      } as any)
      .where(eq(users.uuid, userUuid));

    await syncUserSubscriptionTier({
      userUuid,
      stripeCustomerId: stripeCustomerId || undefined,
      stripe,
    });

    // 6. 记录事件
    console.log(`[Subscription] Paused for user ${userUuid} until ${resumeDate}`);

    return NextResponse.json({
      success: true,
      message: 'Subscription paused successfully',
      resumesAt: resumeDate.toISOString()
    });

  } catch (error) {
    console.error('[Subscription] Pause error:', error);
    return NextResponse.json(
      { error: 'Failed to pause subscription' },
      { status: 500 }
    );
  }
}
