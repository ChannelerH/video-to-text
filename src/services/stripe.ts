import Stripe from "stripe";
import { updateOrder, updateSubOrder } from "./order";
import { syncUserSubscriptionTier } from "./user-subscription";
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { findOrderByOrderNo } from '@/models/order';

// handle checkout session completed
export async function handleCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  try {
    // not handle unpaid session
    if (session.payment_status !== "paid") {
      throw new Error("not handle unpaid session");
    }

    // normalize metadata (Stripe.Metadata behaves like a map but we need plain object)
    const metadata: Record<string, string> = { ...(session.metadata || {}) };

    // fallback: try to read order_no from success_url when metadata missing (Stripe CLI events, etc.)
    if (!metadata.order_no && session.success_url) {
      try {
        const successUrl = new URL(session.success_url);
        const orderNo = successUrl.searchParams.get('order_no');
        if (orderNo) {
          metadata.order_no = orderNo;
        }
        const fallbackEmail = successUrl.searchParams.get('user_email');
        if (fallbackEmail && !metadata.user_email) {
          metadata.user_email = fallbackEmail;
        }
      } catch {}
    }

    if (!metadata.order_no) {
      throw new Error("no metadata in session");
    }

    // ensure user email is available for downstream updates
    if (!metadata.user_email) {
      metadata.user_email =
        session.customer_details?.email || session.customer_email || '';
    }

    const subId = session.subscription as string;
    if (subId) {
      // handle subscription
      const subscription = await stripe.subscriptions.retrieve(subId);

      // update subscription metadata
      await stripe.subscriptions.update(subId, {
        metadata: metadata,
      });

      const item = subscription.items.data[0];

      const customerId = typeof subscription.customer === 'string' ? subscription.customer : '';
      let userUuid = metadata.user_uuid || '';
      if (!userUuid) {
        try {
          const existingOrder = await findOrderByOrderNo(metadata.order_no);
          userUuid = (existingOrder?.user_uuid as string) || '';
        } catch {}
      }

      metadata["sub_id"] = subId;
      metadata["sub_times"] = "1";
      metadata["sub_interval"] = item.plan.interval;
      metadata["sub_interval_count"] = item.plan.interval_count.toString();
      metadata["sub_cycle_anchor"] =
        subscription.billing_cycle_anchor.toString();
      metadata["sub_period_start"] =
        subscription.current_period_start.toString();
      metadata["sub_period_end"] = subscription.current_period_end.toString();

      // update subscription first time paid order
      await updateSubOrder({
        order_no: metadata.order_no,
        user_email: metadata.user_email,
        sub_id: subId,
        sub_interval_count: Number(metadata.sub_interval_count),
        sub_cycle_anchor: Number(metadata.sub_cycle_anchor),
        sub_period_end: Number(metadata.sub_period_end),
        sub_period_start: Number(metadata.sub_period_start),
        sub_times: Number(metadata.sub_times),
        paid_detail: JSON.stringify(session),
      });

      if (userUuid && customerId) {
        try {
          await db()
            .update(users)
            .set({
              stripe_customer_id: customerId,
              stripe_subscription_id: subId,
              stripe_price_id: item.price?.id as any,
              subscription_state: 'active',
              updated_at: new Date(),
            } as any)
            .where(eq(users.uuid, userUuid));
        } catch (error) {
          console.error('[Subscription] Failed to store Stripe identifiers', {
            userUuid,
            customerId,
            error,
          });
        }
      }

      await syncUserSubscriptionTier({
        userUuid: userUuid || undefined,
        stripeCustomerId: customerId || undefined,
        stripe,
      });

      return;
    }

    // update one-time payment order
    const order_no = metadata.order_no;
    const paid_email =
      session.customer_details?.email || session.customer_email || "";
    const paid_detail = JSON.stringify(session);

    await updateOrder({ order_no, paid_email, paid_detail });
  } catch (e) {
    console.log("handle session completed failed: ", e);
    throw e;
  }
}

// handle invoice payment succeeded
export async function handleInvoice(stripe: Stripe, invoice: Stripe.Invoice) {
  try {
    // not handle unpaid invoice
    if (invoice.status !== "paid") {
      throw new Error("not handle unpaid invoice");
    }

    // not handle first subscription, because it's be handled in session completed event
    if (invoice.billing_reason === "subscription_create") {
      return;
    }

    const subId =
      (invoice.subscription as string | null | undefined) ??
      invoice.lines?.data?.[0]?.subscription ??
      "";
    // 如果不是订阅账单，例如一次性计费/分钟包补扣，直接跳过
    if (!subId) {
      console.log('[Stripe] invoice payment (non-subscription) received, skipping');
      return;
    }

    // get subscription
    const subscription = await stripe.subscriptions.retrieve(subId);

    let metadata = subscription.metadata;

    if (!metadata || !metadata.order_no) {
      // get subscription session metadata
      const checkoutSessions = await stripe.checkout.sessions.list({
        subscription: subId,
      });

      if (checkoutSessions.data.length > 0) {
        const session = checkoutSessions.data[0];
        if (session.metadata) {
          metadata = session.metadata;
          await stripe.subscriptions.update(subId, {
            metadata: metadata,
          });
        }
      }
    }

    if (!metadata || !metadata.order_no) {
      throw new Error("no metadata in subscription");
    }

    // get subscription item
    const item = subscription.items.data[0];

    const anchor = subscription.billing_cycle_anchor;
    const start = subscription.current_period_start;
    const end = subscription.current_period_end;

    const periodDuration = end - start;
    const subTimes = Math.round((start - anchor) / periodDuration) + 1;

    metadata["sub_id"] = subId;
    metadata["sub_times"] = subTimes.toString();
    metadata["sub_interval"] = item.plan.interval;
    metadata["sub_interval_count"] = item.plan.interval_count.toString();
    metadata["sub_cycle_anchor"] = subscription.billing_cycle_anchor.toString();
    metadata["sub_period_start"] = subscription.current_period_start.toString();
    metadata["sub_period_end"] = subscription.current_period_end.toString();

    // create renew order
    await updateSubOrder({
      order_no: metadata.order_no,
      user_email: metadata.user_email,
      sub_id: subId,
      sub_interval_count: Number(metadata.sub_interval_count),
      sub_cycle_anchor: Number(metadata.sub_cycle_anchor),
      sub_period_end: Number(metadata.sub_period_end),
      sub_period_start: Number(metadata.sub_period_start),
      sub_times: Number(metadata.sub_times),
      paid_detail: JSON.stringify(invoice),
    });

    await syncUserSubscriptionTier({
      userUuid: metadata.user_uuid || undefined,
      stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : undefined,
      stripe,
    });
  } catch (e) {
    console.log("handle payment succeeded failed: ", e);
    throw e;
  }
}
