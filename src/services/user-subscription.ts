import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, eq, gte, or, isNull, sql } from 'drizzle-orm';

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