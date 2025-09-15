import Stripe from "stripe";
import { respOk } from "@/lib/resp";
import { handleCheckoutSession, handleInvoice } from "@/services/stripe";
import { db } from "@/db";
import { users, orders } from "@/db/schema";
import { eq } from "drizzle-orm";

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
          await db()
            .update(users)
            .set({ subscription_status: "active", updated_at: new Date() } as any)
            .where(eq(users.stripe_customer_id as any, customerId));
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        if (customerId) {
          await db()
            .update(users)
            .set({ subscription_status: "past_due", updated_at: new Date() } as any)
            .where(eq(users.stripe_customer_id as any, customerId));
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const subId = sub.id;

        // 更新 orders 表里该订阅对应订单的过期时间/商品信息
        try {
          const item = sub.items.data[0];
          const nickname = (item?.plan?.nickname || '').toString();
          const product = (item?.plan?.product as string) || '';
          const end = sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : null;
          const cancelAtPeriodEnd = sub.cancel_at_period_end;

          if (sub.status === "canceled") {
            await db()
              .update(orders)
              .set({
                product_name: nickname as any,
                product_id: product as any,
                expired_at: new Date(),
              } as any)
              .where(eq(orders.sub_id as any, subId));
          } else if (cancelAtPeriodEnd && end) {
            const exp = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            await db()
              .update(orders)
              .set({ product_name: nickname as any, product_id: product as any, expired_at: exp } as any)
              .where(eq(orders.sub_id as any, subId));
          } else if (end) {
            const exp = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            await db()
              .update(orders)
              .set({ product_name: nickname as any, product_id: product as any, expired_at: exp } as any)
              .where(eq(orders.sub_id as any, subId));
          } else {
            await db()
              .update(orders)
              .set({ product_name: nickname as any, product_id: product as any } as any)
              .where(eq(orders.sub_id as any, subId));
          }
        } catch {}

        // 同步 users 订阅状态等详细字段
        try {
          const customerId = sub.customer as string;
          const statusMap: Record<string, string> = {
            active: "active",
            past_due: "past_due",
            unpaid: "unpaid",
            canceled: "cancelled",
            incomplete: "incomplete",
            incomplete_expired: "expired",
            trialing: "trial",
            paused: "paused",
          };
          const status = (statusMap[sub.status] || sub.status) as any;
          const priceId = sub.items.data[0]?.price.id;

          await db()
            .update(users)
            .set({
              stripe_subscription_id: sub.id,
              stripe_price_id: priceId as any,
              subscription_status: status,
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
            } as any)
            .where(eq(users.stripe_customer_id as any, customerId));
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
            subscription_status: "cancelled",
            subscription_cancelled_at: new Date(),
            subscription_cancel_at_period_end: false,
            stripe_subscription_id: null,
            stripe_price_id: null,
            updated_at: new Date(),
          } as any)
          .where(eq(users.stripe_customer_id as any, customerId));
        break;
      }

      case "customer.subscription.paused": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const pauseCollection = sub.pause_collection;

        await db()
          .update(users)
          .set({
            subscription_status: "paused",
            subscription_paused_at: new Date(),
            subscription_resumes_at: pauseCollection?.resumes_at
              ? new Date(pauseCollection.resumes_at * 1000)
              : null,
            updated_at: new Date(),
          } as any)
          .where(eq(users.stripe_customer_id as any, customerId));
        break;
      }

      case "customer.subscription.resumed": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        await db()
          .update(users)
          .set({
            subscription_status: "active",
            subscription_paused_at: null,
            subscription_resumes_at: null,
            updated_at: new Date(),
          } as any)
          .where(eq(users.stripe_customer_id as any, customerId));
        break;
      }

      case "customer.subscription.trial_will_end": {
        // 预留：可发送 trial 即将结束提醒
        break;
      }

      case "charge.refunded": {
        // 预留：退款后可根据业务修改额度/状态
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
