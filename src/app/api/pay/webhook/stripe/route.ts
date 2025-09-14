import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { newStripeClient } from '@/integrations/stripe';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function updateOrdersBySubId(subId: string, fields: Partial<typeof orders.$inferInsert>) {
  // update latest order with this sub_id; if none, no-op
  await db().update(orders).set(fields as any).where(eq(orders.sub_id, subId));
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!secret) return NextResponse.json({ success: false, error: 'no webhook secret' }, { status: 500 });
    const stripe = newStripeClient().stripe();
    const sig = req.headers.get('stripe-signature') || '';
    const raw = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret);
    } catch (err: any) {
      return NextResponse.json({ success: false, error: `signature error: ${err.message}` }, { status: 400 });
    }

    switch (event.type) {
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const subId = sub.id;
        const status = sub.status; // active | past_due | canceled | unpaid | incomplete | trialing | paused
        const item = sub.items.data[0];
        const nickname = (item?.plan?.nickname || '').toString();
        const product = (item?.plan?.product as string) || '';
        const end = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        const cancelAtPeriodEnd = sub.cancel_at_period_end;

        // 更新订单产品名/ID，维持到期策略：
        // - 如果 canceled 或 paused -> 立即过期（expired_at=now）
        // - 如果 at_period_end 降级 -> 保持 expired_at 为周期结束
        // - 其他 active/past_due -> expired_at=周期结束+24h
        if (status === 'canceled') {
          await updateOrdersBySubId(subId, { product_name: nickname, product_id: product, expired_at: new Date() });
        } else if (cancelAtPeriodEnd && end) {
          // 降级在期末生效，确保过期时间为本周期结束+24h
          const exp = new Date(end.getTime() + 24 * 60 * 60 * 1000);
          await updateOrdersBySubId(subId, { product_name: nickname, product_id: product, expired_at: exp });
        } else if (end) {
          const exp = new Date(end.getTime() + 24 * 60 * 60 * 1000);
          await updateOrdersBySubId(subId, { product_name: nickname, product_id: product, expired_at: exp });
        } else {
          await updateOrdersBySubId(subId, { product_name: nickname, product_id: product });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await updateOrdersBySubId(sub.id, { expired_at: new Date() });
        break;
      }

      // 续费成功：已由 handleInvoice 处理，这里可不重复
      case 'invoice.payment_succeeded':
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'webhook failed' }, { status: 500 });
  }
}

