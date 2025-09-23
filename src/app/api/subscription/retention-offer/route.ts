import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users, orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentSubscriptionOrder } from '@/services/user-subscription';

export const runtime = 'nodejs';

const RETENTION_COUPON_ID = 'RETENTION_30_OFF_3M';
const DISCOUNT_PERCENT = 30;
const DISCOUNT_MONTHS = 3;

function makeStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY || '';
  if (!key) throw new Error('stripe-key-missing');
  return new Stripe(key);
}

/**
 * POST /api/subscription/retention-offer
 * Claim a retention offer (30% off for 3 months)
 */
export async function POST(request: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user and check if they've already used the retention offer
    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.uuid, userUuid))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has already used retention offer
    if ((user as any).retention_offer_used) {
      const claimedAt = (user as any).retention_offer_claimed_at;
      return NextResponse.json({ 
        error: 'Retention offer already used',
        claimed_at: claimedAt,
        message: 'You have already claimed a retention offer. This offer is limited to one use per customer.'
      }, { status: 400 });
    }

    // Get active subscription
    const activeOrder = await getCurrentSubscriptionOrder(userUuid);
    const subscriptionId = activeOrder?.sub_id ? String(activeOrder.sub_id) : null;

    if (!subscriptionId) {
      return NextResponse.json({ 
        error: 'No active subscription found',
        message: 'You need an active subscription to claim this offer.'
      }, { status: 400 });
    }

    const stripeCustomerId = (user as any).stripe_customer_id as string | null;
    if (!stripeCustomerId) {
      return NextResponse.json({ error: 'Stripe customer not found' }, { status: 400 });
    }

    const stripe = makeStripe();
    
    // Get subscription details to check billing interval
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPrice = subscription.items.data[0]?.price;
    const billingInterval = currentPrice?.recurring?.interval; // 'month' or 'year'
    const isYearlyPlan = billingInterval === 'year';
    
    console.info('[Retention Offer] Subscription details', {
      userUuid,
      subscriptionId,
      billingInterval,
      isYearlyPlan
    });

    // Create or retrieve the retention coupon
    let coupon: Stripe.Coupon;
    try {
      // Try to retrieve existing coupon
      coupon = await stripe.coupons.retrieve(RETENTION_COUPON_ID);
    } catch (error) {
      // Create new coupon if it doesn't exist
      try {
        coupon = await stripe.coupons.create({
          id: RETENTION_COUPON_ID,
          percent_off: DISCOUNT_PERCENT,
          duration: 'repeating',
          duration_in_months: DISCOUNT_MONTHS,
          metadata: {
            type: 'retention_offer',
            description: '30% off for 3 months - Retention offer'
          }
        });
      } catch (createError: any) {
        // If coupon exists but retrieve failed for other reasons
        if (createError.code === 'resource_already_exists') {
          coupon = await stripe.coupons.retrieve(RETENTION_COUPON_ID);
        } else {
          throw createError;
        }
      }
    }

    // Handle yearly vs monthly subscriptions differently
    if (isYearlyPlan) {
      // For yearly plans, issue a partial refund instead of applying a coupon
      try {
        const originalAmount = currentPrice?.unit_amount || 0;
        const currency = currentPrice?.currency || 'usd';
        
        // Calculate refund amount: (yearly_price / 12) * 3 months * 30% discount
        const monthlyEquivalent = Math.floor(originalAmount / 12);
        const refundAmount = Math.floor(monthlyEquivalent * DISCOUNT_MONTHS * (DISCOUNT_PERCENT / 100));
        
        console.info('[Retention Offer] Processing yearly plan refund', {
          originalAmount,
          monthlyEquivalent,
          refundAmount,
          currency
        });

        // Find the latest payment for this subscription
        const charges = await stripe.charges.list({
          customer: stripeCustomerId,
          limit: 10
        });
        
        const latestCharge = charges.data.find(charge => 
          charge.metadata?.subscription_id === subscriptionId || 
          charge.invoice
        );

        if (!latestCharge) {
          return NextResponse.json({ 
            error: 'Cannot apply offer',
            message: 'Unable to find the payment for your subscription. Please contact support.'
          }, { status: 400 });
        }

        // Create a partial refund
        const refund = await stripe.refunds.create({
          charge: latestCharge.id,
          amount: refundAmount,
          reason: 'requested_by_customer',
          metadata: {
            type: 'retention_offer',
            discount_percent: String(DISCOUNT_PERCENT),
            equivalent_months: String(DISCOUNT_MONTHS)
          }
        });

        // Update user record
        await db()
          .update(users)
          .set({
            retention_offer_used: true,
            retention_offer_claimed_at: new Date(),
            retention_offer_expires_at: null, // No expiry for yearly refunds
            retention_coupon_id: `refund_${refund.id}`,
            retention_discount_percent: DISCOUNT_PERCENT,
            retention_discount_months: DISCOUNT_MONTHS,
            updated_at: new Date(),
          } as any)
          .where(eq(users.uuid, userUuid));

        console.info('[Retention Offer] Yearly plan refund processed', {
          userUuid,
          subscriptionId,
          refundId: refund.id,
          refundAmount
        });

        return NextResponse.json({
          success: true,
          message: `Retention offer applied! We've refunded ${(refundAmount / 100).toFixed(2)} ${currency.toUpperCase()} to your account (equivalent to ${DISCOUNT_PERCENT}% off for ${DISCOUNT_MONTHS} months).`,
          discount: {
            type: 'refund',
            percent: DISCOUNT_PERCENT,
            months: DISCOUNT_MONTHS,
            refund_amount: refundAmount,
            currency: currency
          },
          subscription: {
            id: subscription.id,
            billing_interval: billingInterval
          }
        });

      } catch (refundError: any) {
        console.error('[Retention Offer] Failed to process yearly plan refund', {
          userUuid,
          subscriptionId,
          error: refundError.message
        });
        
        return NextResponse.json({ 
          error: 'Failed to apply offer',
          message: 'Unable to process the discount for yearly plans. Please contact support.'
        }, { status: 500 });
      }
      
    } else {
      // For monthly plans, apply the coupon as before
      try {
        const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
          coupon: RETENTION_COUPON_ID,
          metadata: {
            retention_offer_applied: 'true',
            retention_offer_date: new Date().toISOString()
          }
        });

        // Calculate when the discount expires (after 3 billing cycles)
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + DISCOUNT_MONTHS);

        // Update user record
        await db()
          .update(users)
          .set({
            retention_offer_used: true,
            retention_offer_claimed_at: new Date(),
            retention_offer_expires_at: expiresAt,
            retention_coupon_id: RETENTION_COUPON_ID,
            retention_discount_percent: DISCOUNT_PERCENT,
            retention_discount_months: DISCOUNT_MONTHS,
            updated_at: new Date(),
          } as any)
          .where(eq(users.uuid, userUuid));

        // Calculate the discounted price for the next 3 months
        const originalAmount = currentPrice?.unit_amount || 0;
        const discountedAmount = Math.floor(originalAmount * (1 - DISCOUNT_PERCENT / 100));

        console.info('[Retention Offer] Monthly plan coupon applied', {
          userUuid,
          subscriptionId,
          couponId: RETENTION_COUPON_ID,
          originalAmount,
          discountedAmount,
          expiresAt
        });

        return NextResponse.json({
          success: true,
          message: `Retention offer applied! You'll get ${DISCOUNT_PERCENT}% off for the next ${DISCOUNT_MONTHS} months.`,
          discount: {
            type: 'coupon',
            percent: DISCOUNT_PERCENT,
            months: DISCOUNT_MONTHS,
            expires_at: expiresAt.toISOString(),
            original_amount: originalAmount,
            discounted_amount: discountedAmount,
            currency: currentPrice?.currency || 'usd'
          },
          subscription: {
            id: updatedSubscription.id,
            billing_interval: billingInterval,
            current_period_end: updatedSubscription.current_period_end 
              ? new Date(updatedSubscription.current_period_end * 1000).toISOString() 
              : null
          }
        });
      } catch (stripeError: any) {
        console.error('[Retention Offer] Failed to apply coupon', {
          userUuid,
          subscriptionId,
          error: stripeError.message
        });

        // Check if subscription already has a discount
        if (stripeError.code === 'resource_missing' || stripeError.message?.includes('already has a discount')) {
          return NextResponse.json({ 
            error: 'Cannot apply offer',
            message: 'Your subscription already has an active discount. Only one discount can be active at a time.'
          }, { status: 400 });
        }

        throw stripeError;
      }
    }

  } catch (error) {
    console.error('[Retention Offer] Unexpected error:', error);
    return NextResponse.json({ 
      error: 'Failed to apply retention offer',
      message: 'An error occurred while processing your request. Please try again or contact support.'
    }, { status: 500 });
  }
}

/**
 * GET /api/subscription/retention-offer
 * Check retention offer eligibility
 */
export async function GET(request: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.uuid, userUuid))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const retentionOfferUsed = (user as any).retention_offer_used || false;
    const claimedAt = (user as any).retention_offer_claimed_at;
    const expiresAt = (user as any).retention_offer_expires_at;

    // Check if user has an active subscription
    const activeOrder = await getCurrentSubscriptionOrder(userUuid);
    const hasActiveSubscription = !!activeOrder?.sub_id;

    // User is eligible if:
    // 1. They haven't used the retention offer before
    // 2. They have an active subscription
    const eligible = !retentionOfferUsed && hasActiveSubscription;

    return NextResponse.json({
      eligible,
      retention_offer_used: retentionOfferUsed,
      claimed_at: claimedAt,
      expires_at: expiresAt,
      has_active_subscription: hasActiveSubscription,
      offer_details: eligible ? {
        discount_percent: DISCOUNT_PERCENT,
        discount_months: DISCOUNT_MONTHS,
        description: `Get ${DISCOUNT_PERCENT}% off for ${DISCOUNT_MONTHS} months`
      } : null
    });

  } catch (error) {
    console.error('[Retention Offer] Failed to check eligibility:', error);
    return NextResponse.json({ 
      error: 'Failed to check eligibility',
      eligible: false 
    }, { status: 500 });
  }
}