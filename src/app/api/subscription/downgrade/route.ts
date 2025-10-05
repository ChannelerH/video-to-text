import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users, orders } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { readJson } from '@/lib/read-json';
import {
  getCurrentSubscriptionOrder,
  getUserSubscriptionPlan,
  syncUserSubscriptionTier,
} from '@/services/user-subscription';
import {
  DowngradeTarget,
  resolveDowngradePlan,
  getDowngradePlanPricing,
} from '@/services/subscription-plan';

export const runtime = 'nodejs';

type StripeProrationBehavior = Stripe.SubscriptionUpdateParams.ProrationBehavior;

function makeStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY || '';
  if (!key) throw new Error('stripe-key-missing');
  return new Stripe(key);
}

function planRank(plan: string): number {
  const ranks: Record<string, number> = {
    FREE: 0,
    BASIC: 1,
    PRO: 2,
    PREMIUM: 3,
  };
  return ranks[plan] ?? 0;
}

interface DowngradeRequestBody {
  target: DowngradeTarget;
  immediate?: boolean;
  prorationBehavior?: StripeProrationBehavior;
  locale?: string;
  reason?: string;
  feedback?: string;
}

export async function POST(request: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: DowngradeRequestBody;
    try {
      body = await readJson<DowngradeRequestBody>(request);
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const {
      target,
      immediate = false,
      prorationBehavior,
      locale: requestLocale,
      reason = '',
      feedback = '',
    } = body;

    const normalizedReason = reason.trim();
    const normalizedFeedback = feedback.trim();
    const reasonValue = normalizedReason ? normalizedReason.slice(0, 255) : null;
    const feedbackValue = normalizedFeedback ? normalizedFeedback : null;
    console.info('[Subscription][Downgrade] request received', {
      userUuid,
      target,
      immediate,
      prorationBehavior,
      locale: requestLocale,
    });
    if (!target) {
      return NextResponse.json({ error: 'Target plan required' }, { status: 400 });
    }

    const downgradeDefinition = resolveDowngradePlan(target);

    const [user] = await db()
      .select()
      .from(users)
      .where(eq(users.uuid, userUuid))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const stripeCustomerId = (user as any).stripe_customer_id as string | null;
    const activeOrder = await getCurrentSubscriptionOrder(userUuid);
    const subscriptionId = activeOrder?.sub_id ? String(activeOrder.sub_id) : null;

    if (!subscriptionId) {
      console.warn('[Subscription][Downgrade] no active subscription order found', { userUuid, target });
      if (target === 'free') {
        return NextResponse.json({
          success: true,
          plan: 'FREE',
          immediate: true,
          message: 'No active subscription to downgrade',
        });
      }
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });
    }

    if (!stripeCustomerId) {
      console.warn('[Subscription][Downgrade] missing stripe customer id', { userUuid });
      return NextResponse.json({ error: 'Stripe customer not found' }, { status: 400 });
    }

    const currentPlan = await getUserSubscriptionPlan(userUuid);
    console.info('[Subscription][Downgrade] current plan', { userUuid, currentPlan });
    if (planRank(downgradeDefinition.plan) >= planRank(currentPlan)) {
      console.warn('[Subscription][Downgrade] invalid downgrade target', {
        userUuid,
        target,
        requestedPlan: downgradeDefinition.plan,
        currentPlan,
      });
      if (downgradeDefinition.plan === currentPlan) {
        return NextResponse.json({ error: 'Already on the requested plan' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Target plan is not lower than current plan' }, { status: 400 });
    }

    const stripe = makeStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (target === 'free') {
      return await handleDowngradeToFree({
        stripe,
        subscription,
        subscriptionId,
        stripeCustomerId,
        userUuid,
        immediate,
        reason: reasonValue,
        feedback: feedbackValue,
      });
    }
    const subscriptionItem = subscription.items?.data?.[0];
    if (!subscriptionItem) {
      return NextResponse.json({ error: 'Subscription has no items' }, { status: 400 });
    }

    const planPricing = await getDowngradePlanPricing(target as Exclude<DowngradeTarget, 'free'>, requestLocale || 'en');

    if (!immediate) {
      const existingScheduleId = (user as any).subscription_pending_schedule_id as string | null;
      if (existingScheduleId) {
        console.info('[Subscription][Downgrade] existing schedule detected, attempting release', {
          userUuid,
          target,
          existingSchedule: existingScheduleId,
        });

        try {
          await stripe.subscriptionSchedules.release(existingScheduleId);
        } catch (releaseError) {
          console.error('[Subscription][Downgrade] failed to release existing schedule', {
            userUuid,
            target,
            existingSchedule: existingScheduleId,
            error: releaseError,
          });
          return NextResponse.json({
            error: 'Failed to reset previous downgrade. Please try again or contact support.',
          }, { status: 400 });
        }

        await db()
          .update(users)
          .set({
            subscription_pending_schedule_id: null,
            subscription_pending_plan: null,
            subscription_pending_effective_at: null,
            subscription_pending_reason: null,
            subscription_pending_feedback: null,
            subscription_state: 'active',
            updated_at: new Date(),
          } as any)
          .where(eq(users.uuid, userUuid));

        await syncUserSubscriptionTier({
          userUuid,
          stripeCustomerId,
          stripe,
        });
      }

      if (!subscription.current_period_end) {
        return NextResponse.json({ error: 'Subscription period end missing' }, { status: 400 });
      }

      const quantity = subscriptionItem.quantity || 1;
      const currentPriceId = (subscriptionItem.price?.id || subscriptionItem.plan?.id || '') as string;

      if (!currentPriceId) {
        return NextResponse.json({ error: 'Unable to determine current subscription price' }, { status: 400 });
      }

      const price = await stripe.prices.create({
        unit_amount: planPricing.amount,
        currency: planPricing.currency.toLowerCase(),
        recurring: planPricing.interval
          ? {
              interval: planPricing.interval,
            }
          : undefined,
        nickname: planPricing.productName, // Add nickname to help identify
        product_data: {
          name: planPricing.productName,
          metadata: {
            source: 'downgrade',
            order_type: planPricing.orderType || '',
          },
        },
        metadata: {
          downgrade_target: planPricing.target,
          order_type: planPricing.orderType || '',
        },
      });

      const schedule = await stripe.subscriptionSchedules.create({
        from_subscription: subscriptionId,
      });

      const scheduleDetails = await stripe.subscriptionSchedules.retrieve(schedule.id);
      const currentPhase = scheduleDetails.phases?.[0];
      const currentPhaseStart =
        currentPhase?.start_date ??
        scheduleDetails.current_phase?.start_date ??
        subscription.current_period_start ??
        'now';
      const currentPhaseEnd = currentPhase?.end_date ?? subscription.current_period_end ?? undefined;
      const nextPhaseStart = scheduleDetails.current_phase?.end_date
        ?? currentPhaseEnd
        ?? subscription.current_period_end
        ?? undefined;

      const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [];

      phases.push({
        start_date: currentPhaseStart,
        end_date: currentPhaseEnd,
        items: [
          {
            price: currentPriceId,
            quantity,
          },
        ],
      });

      if (nextPhaseStart) {
        phases.push({
          start_date: nextPhaseStart,
          items: [
            {
              price: price.id,
              quantity,
            },
          ],
        });
      } else {
        phases.push({
          start_date: currentPhaseEnd ?? 'now',
          items: [
            {
              price: price.id,
              quantity,
            },
          ],
        });
      }

      await stripe.subscriptionSchedules.update(schedule.id, {
        phases,
      });

      const effectiveDate = new Date(subscription.current_period_end * 1000);

      await db()
        .update(users)
        .set({
          subscription_state: 'scheduled_downgrade',
          subscription_pending_plan: target,
          subscription_pending_schedule_id: schedule.id,
          subscription_pending_effective_at: effectiveDate,
          subscription_pending_reason: reasonValue,
          subscription_pending_feedback: feedbackValue,
          updated_at: new Date(),
        } as any)
        .where(eq(users.uuid, userUuid));

      console.info('[Subscription][Downgrade] schedule created', {
        userUuid,
        target,
        scheduleId: schedule.id,
        effectiveDate,
      });

      return NextResponse.json({
        success: true,
        plan: downgradeDefinition.plan,
        scheduled: true,
        scheduleId: schedule.id,
        effectiveAt: effectiveDate.toISOString(),
      });
    }

    const price = await stripe.prices.create({
      unit_amount: planPricing.amount,
      currency: planPricing.currency.toLowerCase(),
      recurring: planPricing.interval
        ? {
            interval: planPricing.interval,
          }
        : undefined,
      nickname: planPricing.productName, // Add nickname to help identify
      product_data: {
        name: planPricing.productName,
        metadata: {
          source: 'downgrade',
          order_type: planPricing.orderType || '',
        },
      },
      metadata: {
        downgrade_target: planPricing.target,
        order_type: planPricing.orderType || '',
      },
    });

    const priceId = price.id;

    if (prorationBehavior) {
      console.warn('[Subscription][Downgrade] proration_behavior unsupported on current Stripe version, ignoring value', {
        userUuid,
        requestedBehavior: prorationBehavior,
      });
    }

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      items: [
        {
          id: subscriptionItem.id,
          price: priceId,
        },
      ],
    });

    const updatedPrice = updatedSubscription.items?.data?.[0]?.price;
    const updatedProduct = updatedPrice?.product;

    const updateOrdersPayload: Record<string, any> = {
      product_name: planPricing.productName,
      order_type: downgradeDefinition.orderType,
      updated_at: new Date(),
    };

    if (typeof updatedProduct === 'string') {
      updateOrdersPayload.product_id = updatedProduct;
    } else if (planPricing.productId) {
      updateOrdersPayload.product_id = planPricing.productId;
    }

    if (updatedSubscription.current_period_end) {
      const endDate = new Date(updatedSubscription.current_period_end * 1000);
      const exp = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      updateOrdersPayload.expired_at = exp;
    }

    try {
      await db()
        .update(orders)
        .set(updateOrdersPayload as any)
        .where(eq(orders.sub_id as any, subscriptionId));
    } catch (orderError) {
      console.error('[Subscription] Failed to update orders on immediate downgrade', orderError);
    }

    await db()
      .update(users)
      .set({
        stripe_price_id: priceId,
        subscription_state: 'active',
        subscription_cancel_at_period_end: false,
        subscription_cancel_reason: null,
        subscription_cancel_feedback: null,
        subscription_pending_plan: null,
        subscription_pending_schedule_id: null,
        subscription_pending_effective_at: null,
        subscription_pending_reason: null,
        subscription_pending_feedback: null,
        updated_at: new Date(),
      } as any)
      .where(eq(users.uuid, userUuid));

    await syncUserSubscriptionTier({
      userUuid,
      stripeCustomerId,
      stripe,
    });

    console.info('[Subscription][Downgrade] immediate downgrade applied', {
      userUuid,
      target,
      priceId,
    });

    return NextResponse.json({
      success: true,
      plan: downgradeDefinition.plan,
      stripeSubscriptionId: updatedSubscription.id,
      priceId,
      immediate: true,
      prorationBehavior: null,
      currentPeriodEnd: updatedSubscription.current_period_end
        ? new Date(updatedSubscription.current_period_end * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error('[Subscription] Downgrade error:', {
      error,
    });
    return NextResponse.json({ error: 'Failed to downgrade subscription' }, { status: 500 });
  }
}

interface DowngradeToFreeParams {
  stripe: Stripe;
  subscription: Stripe.Subscription;
  subscriptionId: string;
  stripeCustomerId: string;
  userUuid: string;
  immediate: boolean;
  reason: string | null;
  feedback: string | null;
}

async function handleDowngradeToFree(params: DowngradeToFreeParams) {
  const {
    stripe,
    subscription,
    subscriptionId,
    stripeCustomerId,
    userUuid,
    immediate,
    reason,
    feedback,
  } = params;

  const cancelReason = reason || 'downgrade_to_free';
  const cancelFeedback = feedback || null;

  try {
    let updatedSubscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription> = subscription;

    if (immediate) {
      updatedSubscription = await stripe.subscriptions.cancel(subscriptionId);
    } else {
      updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
        metadata: {
          downgrade: 'free',
        },
      });
    }

    if (immediate) {
      await db()
        .update(users)
        .set({
          subscription_state: 'cancelled',
          subscription_cancelled_at: new Date(),
          subscription_cancel_at_period_end: false,
          subscription_cancel_reason: cancelReason,
          subscription_cancel_feedback: cancelFeedback,
          stripe_subscription_id: null,
          stripe_price_id: null,
          subscription_pending_plan: null,
          subscription_pending_schedule_id: null,
          subscription_pending_effective_at: null,
          subscription_pending_reason: null,
          subscription_pending_feedback: null,
          updated_at: new Date(),
        } as any)
        .where(eq(users.uuid, userUuid));
    } else {
      const effectiveDate = new Date(subscription.current_period_end * 1000);

      await db()
        .update(users)
        .set({
          subscription_state: 'scheduled_downgrade',
          subscription_cancel_at_period_end: true,
          subscription_cancel_reason: cancelReason,
          subscription_cancel_feedback: cancelFeedback,
          subscription_pending_plan: 'free',
          subscription_pending_schedule_id: null,
          subscription_pending_effective_at: effectiveDate,
          subscription_pending_reason: reason,
          subscription_pending_feedback: feedback,
          updated_at: new Date(),
        } as any)
        .where(eq(users.uuid, userUuid));

      await syncUserSubscriptionTier({
        userUuid,
        stripeCustomerId,
        stripe,
      });

      console.info('[Subscription][Downgrade] free scheduled cancellation', {
        userUuid,
        subscriptionId,
        effectiveDate,
      });

      return NextResponse.json({
        success: true,
        plan: 'FREE',
        immediate,
        scheduled: true,
        cancelAt: effectiveDate.toISOString(),
      });
    }

    await syncUserSubscriptionTier({
      userUuid,
      stripeCustomerId,
      stripe,
    });

    console.info('[Subscription][Downgrade] free immediate cancellation', {
      userUuid,
      subscriptionId,
    });

    return NextResponse.json({
      success: true,
      plan: 'FREE',
      immediate,
      scheduled: false,
      cancelAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Subscription] Downgrade-to-free error:', error);
    return NextResponse.json({ error: 'Failed to downgrade to free' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    const scheduleId = (user as any).subscription_pending_schedule_id as string | null;
    const stripeCustomerId = (user as any).stripe_customer_id as string | null;

    if (!scheduleId) {
      return NextResponse.json({ error: 'No scheduled downgrade to cancel' }, { status: 400 });
    }

    const stripe = makeStripe();

    try {
      await stripe.subscriptionSchedules.release(scheduleId);
    } catch (error) {
      console.error('[Subscription] Failed to release schedule', error);
      return NextResponse.json({ error: 'Failed to cancel scheduled downgrade' }, { status: 500 });
    }

    await db()
      .update(users)
      .set({
        subscription_state: 'active',
        subscription_pending_plan: null,
        subscription_pending_schedule_id: null,
        subscription_pending_effective_at: null,
        subscription_pending_reason: null,
        subscription_pending_feedback: null,
        updated_at: new Date(),
      } as any)
      .where(eq(users.uuid, userUuid));

    await syncUserSubscriptionTier({
      userUuid,
      stripeCustomerId: stripeCustomerId || undefined,
      stripe,
    });

    console.info('[Subscription][Downgrade] scheduled downgrade cancelled', {
      userUuid,
      scheduleId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Subscription] Cancel scheduled downgrade error:', error);
    return NextResponse.json({ error: 'Failed to cancel scheduled downgrade' }, { status: 500 });
  }
}
