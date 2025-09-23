import Stripe from "stripe";
import { respOk } from "@/lib/resp";
import { handleCheckoutSession, handleInvoice } from "@/services/stripe";
import { syncUserSubscriptionTier } from "@/services/user-subscription";
import { db } from "@/db";
import { users, orders, refunds } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOrderType } from "@/services/order-type";

// Ensure Node runtime for crypto used by Stripe webhook signature verification
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // Support both STRIPE_PRIVATE_KEY and STRIPE_SECRET_KEY for compatibility
    const stripePrivateKey =
      process.env.STRIPE_PRIVATE_KEY || process.env.STRIPE_SECRET_KEY;
    const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripePrivateKey || !stripeWebhookSecret) {
      throw new Error("invalid stripe config");
    }

    const stripe = new Stripe(stripePrivateKey, {
      // Cloudflare Workers use the Fetch API for their API requests.
      httpClient: Stripe.createFetchHttpClient(),
    });

    const sign = req.headers.get("stripe-signature") as string;
    const body = await req.text();
    if (!sign || !body) {
      throw new Error("invalid notify data");
    }

    const event = await stripe.webhooks.constructEventAsync(
      body,
      sign,
      stripeWebhookSecret
    );

    console.log("stripe notify event: ", event);

    switch (event.type) {
      case "checkout.session.completed": {
        // 首次支付完成：创建/更新订单、发放额度
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSession(stripe, session);
        break;
      }

      case "invoice.payment_succeeded": {
        // 订阅续费账务：生成续费订单等
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoice(stripe, invoice);

        // 同步用户订阅状态为 active（与 users 表对齐）
        const customerId = invoice.customer as string;
        if (customerId) {
          await syncUserSubscriptionTier({ stripeCustomerId: customerId, stripe });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        if (customerId) {
          await syncUserSubscriptionTier({ stripeCustomerId: customerId, stripe });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const subId = sub.id;

        // 更新 orders 表里该订阅对应订单的过期时间/商品信息
        try {
          const item = sub.items.data[0];
          const nickname = (item?.plan?.nickname || '').toString();
          const product = (item?.plan?.product as string) || '';
          const interval = item?.plan?.interval || 'month'; // month or year
          const end = sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null;
          const cancelAtPeriodEnd = sub.cancel_at_period_end;

          const [existingOrder] = await db()
            .select({ order_type: orders.order_type, order_no: orders.order_no, product_name: orders.product_name })
            .from(orders)
            .where(eq(orders.sub_id as any, subId))
            .limit(1);

          const priceOrderType = (item?.price?.metadata?.order_type as string | undefined) || undefined;
          const priceAmount = item?.price?.unit_amount || undefined;
          const orderType = getOrderType(
            product as string,
            nickname as string,
            interval as string,
            priceOrderType || (existingOrder?.order_type as string | undefined),
            priceAmount
          );

          const effectiveProductName = nickname || (item?.price?.nickname || '') || (existingOrder?.product_name as string || '').toString();

          console.info('[Stripe][Webhook][subscription.updated] determine order_type', {
            subId,
            product,
            nickname,
            interval,
            existingOrderType: existingOrder?.order_type,
            computedOrderType: orderType,
            cancelAtPeriodEnd,
          });

          if (sub.status === "canceled") {
            await db()
              .update(orders)
              .set({
                product_name: (effectiveProductName || existingOrder?.product_name) as any, 
                product_id: product as any, 
                order_type: orderType as any,
                expired_at: new Date(),
              } as any)
              .where(eq(orders.sub_id as any, subId));
          } else if (cancelAtPeriodEnd && end) {
            const exp = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            await db()
              .update(orders)
              .set({ 
                product_name: (effectiveProductName || existingOrder?.product_name) as any, 
                product_id: product as any, 
                order_type: orderType as any,
                expired_at: exp 
              } as any)
              .where(eq(orders.sub_id as any, subId));
          } else if (end) {
            const exp = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            await db()
              .update(orders)
              .set({ 
                product_name: (effectiveProductName || existingOrder?.product_name) as any, 
                product_id: product as any, 
                order_type: orderType as any,
                expired_at: exp 
              } as any)
              .where(eq(orders.sub_id as any, subId));
          } else {
            await db()
              .update(orders)
              .set({ 
                product_name: (effectiveProductName || existingOrder?.product_name) as any, 
                product_id: product as any,
                order_type: orderType as any 
              } as any)
              .where(eq(orders.sub_id as any, subId));
          }
        } catch {}

        // 同步 users 订阅状态等详细字段
        try {
          const customerId = sub.customer as string;
          const priceId = sub.items.data[0]?.price.id;
          const scheduleId = (sub.schedule as string | null | undefined) || null;

          const updatePayload: Record<string, any> = {
            stripe_subscription_id: sub.id,
            stripe_price_id: priceId as any,
            subscription_current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000)
              : null,
            subscription_current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            subscription_cancel_at_period_end: sub.cancel_at_period_end,
            subscription_trial_end: sub.trial_end
              ? new Date(sub.trial_end * 1000)
              : null,
            updated_at: new Date(),
          };

          if (!scheduleId) {
            updatePayload.subscription_pending_plan = null;
            updatePayload.subscription_pending_schedule_id = null;
            updatePayload.subscription_pending_effective_at = null;
            updatePayload.subscription_state = 'active';
          } else {
            updatePayload.subscription_pending_schedule_id = scheduleId;
          }

          await db()
            .update(users)
            .set(updatePayload as any)
            .where(eq(users.stripe_customer_id as any, customerId));

          await syncUserSubscriptionTier({ stripeCustomerId: customerId, stripe });
        } catch {}

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        // 订单立即过期
        try {
          await db()
            .update(orders)
            .set({ expired_at: new Date() } as any)
            .where(eq(orders.sub_id as any, sub.id));
        } catch {}

        // 用户状态标记为 cancelled
        await db()
          .update(users)
          .set({
            subscription_cancelled_at: new Date(),
            subscription_cancel_at_period_end: false,
            stripe_subscription_id: null,
            stripe_price_id: null,
            updated_at: new Date(),
          } as any)
          .where(eq(users.stripe_customer_id as any, customerId));

        await syncUserSubscriptionTier({ stripeCustomerId: customerId, stripe });
        break;
      }

      case "customer.subscription.paused": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const pauseCollection = sub.pause_collection;

        await db()
          .update(users)
          .set({
            subscription_paused_at: new Date(),
            subscription_resumes_at: pauseCollection?.resumes_at
              ? new Date(pauseCollection.resumes_at * 1000)
              : null,
            updated_at: new Date(),
          } as any)
          .where(eq(users.stripe_customer_id as any, customerId));

        await syncUserSubscriptionTier({ stripeCustomerId: customerId, stripe });
        break;
      }

      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await db()
          .update(users)
          .set({
            subscription_paused_at: null,
            subscription_resumes_at: null,
            updated_at: new Date(),
          } as any)
          .where(eq(users.stripe_customer_id as any, customerId));

        await syncUserSubscriptionTier({ stripeCustomerId: customerId, stripe });
        break;
      }

      case "customer.subscription.trial_will_end": {
        // 预留：可发送 trial 即将结束提醒
        break;
      }

      case "charge.refunded": {
        // 处理退款落库：记录到 refunds 表，便于对账/客服
        try {
          const charge = event.data.object as Stripe.Charge;
          const customerId = (charge.customer || '') as string;
          const paymentIntent = String((charge.payment_intent as any) || charge.id);

          // 取本次退款金额（尽量取最新一条 refund 的 amount，兜底用 amount_refunded）
          const refundsList = (charge.refunds && Array.isArray(charge.refunds.data)) ? charge.refunds.data : [];
          const latestRefund = refundsList.length > 0 ? refundsList[refundsList.length - 1] : undefined;
          const amountCents = Number((latestRefund?.amount as any) || charge.amount_refunded || 0);
          const currency = String((latestRefund?.currency as any) || charge.currency || 'usd');
          const reason = String((latestRefund?.reason as any) || 'charge_refunded');

          // 找到用户 UUID（通过 stripe_customer_id 反查）
          let userUuid = '';
          if (customerId) {
            try {
              const { users } = await import('@/db/schema');
              const { eq } = await import('drizzle-orm');
              const rows = await db().select().from(users).where(eq(users.stripe_customer_id as any, customerId)).limit(1);
              userUuid = (rows?.[0] as any)?.uuid || '';
            } catch {}
          }

          if (userUuid && paymentIntent && amountCents > 0) {
            await db().insert(refunds).values({
              user_uuid: userUuid,
              stripe_payment_intent: paymentIntent,
              amount_cents: amountCents,
              currency,
              reason,
              created_at: new Date()
            } as any);
          }
        } catch (e) {
          console.log('[Webhook] charge.refunded handle error:', e);
        }
        break;
      }

      default:
        console.log("not handle event: ", event.type);
    }

    return respOk();
  } catch (e: any) {
    console.log("stripe notify failed: ", e);
    return Response.json(
      { error: `handle stripe notify failed: ${e.message}` },
      { status: 500 }
    );
  }
}
