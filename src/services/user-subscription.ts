import { db } from '@/db';
import { orders, users } from '@/db/schema';
import { and, eq, gte, or, isNull, sql } from 'drizzle-orm';
import Stripe from 'stripe';

export type SubscriptionPlan = 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';

/**
 * Get user's actual subscription plan (what they're paying for)
 * This is different from getUserTier which returns functional permissions
 */
export async function getUserSubscriptionPlan(userUuid: string): Promise<SubscriptionPlan> {
  const now = sql`NOW()`;
  
  // Query active subscriptions from orders table
  const activeSubscriptions = await db()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.user_uuid, userUuid),
        eq(orders.status, 'paid'),
        sql`${orders.order_type} IN ('basic_monthly', 'basic_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')`,
        or(
          isNull(orders.expired_at),
          gte(orders.expired_at, now)
        )
      )
    );

  // If no active subscriptions, return FREE
  if (activeSubscriptions.length === 0) {
    return 'FREE';
  }

  // Find the highest tier subscription
  let highestTier: SubscriptionPlan = 'FREE';
  
  for (const sub of activeSubscriptions) {
    const orderType = (sub.order_type || '').toLowerCase();
    
    if (orderType.includes('premium')) {
      return 'PREMIUM'; // Highest possible, return immediately
    } else if (orderType.includes('pro')) {
      highestTier = 'PRO';
    } else if (orderType.includes('basic') && highestTier !== 'PRO') {
      highestTier = 'BASIC';
    }
  }

  return highestTier;
}

/**
 * Get user's active subscription details
 */
export async function getUserActiveSubscriptions(userUuid: string) {
  const now = sql`NOW()`;
  
  const activeSubscriptions = await db()
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.user_uuid, userUuid),
        eq(orders.status, 'paid'),
        sql`${orders.order_type} IN ('basic_monthly', 'basic_yearly', 'pro_monthly', 'pro_yearly', 'premium_monthly', 'premium_yearly')`,
        or(
          isNull(orders.expired_at),
          gte(orders.expired_at, now)
        )
      )
    )
    .orderBy(orders.created_at);

  return activeSubscriptions;
}

interface SyncSubscriptionTierParams {
  userUuid?: string;
  stripeCustomerId?: string;
  stripe?: Stripe;
}

/**
 * 根据有效订阅重新同步用户的 subscription_status（仅代表等级）。
 */
export async function syncUserSubscriptionTier({
  userUuid,
  stripeCustomerId,
  stripe,
}: SyncSubscriptionTierParams) {
  try {
    let targetUuid = userUuid || '';
    let customerId = stripeCustomerId || '';

    if (!targetUuid || !customerId) {
      const rows = await db()
        .select({ uuid: users.uuid, stripe_customer_id: users.stripe_customer_id })
        .from(users)
        .where(
          targetUuid
            ? eq(users.uuid, targetUuid)
            : eq(users.stripe_customer_id as any, stripeCustomerId || '')
        )
        .limit(1);

      if (rows?.length) {
        targetUuid = targetUuid || (rows[0].uuid as string) || '';
        customerId = customerId || ((rows[0].stripe_customer_id as string) || '');
      }
    }

    if (!targetUuid) {
      return;
    }

    const plan = await getUserSubscriptionPlan(targetUuid);
    const normalizedStatus = plan.toLowerCase();

    let aggregatedState: string | undefined;

    if (customerId) {
      let stripeClient = stripe;

      if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY || '';
        if (key) {
          stripeClient = new Stripe(key);
        }
      }

      if (stripeClient) {
        try {
          const subscriptions = await stripeClient.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 100,
          });

          aggregatedState = aggregateSubscriptionState(subscriptions.data);
        } catch (stripeError) {
          console.error('[Subscription] Failed to fetch Stripe subscriptions', {
            customerId,
            error: stripeError,
          });
        }
      }
    }

    const updatePayload: Record<string, any> = {
      subscription_status: normalizedStatus,
      updated_at: new Date(),
    };

    if (typeof aggregatedState === 'string') {
      updatePayload.subscription_state = aggregatedState;
    }

    await db()
      .update(users)
      .set(updatePayload as any)
      .where(eq(users.uuid as any, targetUuid));
  } catch (error) {
    console.error('[Subscription] Failed to sync subscription tier', {
      userUuid,
      stripeCustomerId,
      error,
    });
  }
}

function aggregateSubscriptionState(subscriptions: Stripe.Subscription[]): string {
  if (!subscriptions || subscriptions.length === 0) {
    return 'inactive';
  }

  const statusPriority: Record<string, number> = {
    active: 7,
    trial: 6,
    cancelling: 5,
    past_due: 4,
    unpaid: 3,
    paused: 3,
    incomplete: 2,
    incomplete_expired: 1,
    cancelled: 1,
    expired: 1,
    inactive: 0,
  };

  let bestState = 'inactive';
  let bestPriority = -1;

  for (const sub of subscriptions) {
    const normalized = normalizeSubscriptionState(sub);
    const priority = statusPriority[normalized] ?? 0;

    if (priority > bestPriority) {
      bestPriority = priority;
      bestState = normalized;
    }
  }

  return bestState;
}

function normalizeSubscriptionState(subscription: Stripe.Subscription): string {
  if (subscription.pause_collection) {
    return 'paused';
  }

  if (subscription.cancel_at_period_end && (subscription.status === 'active' || subscription.status === 'trialing')) {
    return 'cancelling';
  }

  const statusMap: Record<string, string> = {
    active: 'active',
    trialing: 'trial',
    past_due: 'past_due',
    unpaid: 'unpaid',
    canceled: 'cancelled',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    paused: 'paused',
  };

  return statusMap[subscription.status] || subscription.status;
}
