import { getActiveOrdersByUserUuid } from '@/models/order';
import { newStripeClient } from '@/integrations/stripe';

export async function createOverageInvoiceItem(userUuid: string, minutes: number, centsPerMinute: number = 5) {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, reason: 'stripe_disabled' } as const;
  const orders = await getActiveOrdersByUserUuid(userUuid);
  const sub = orders?.find((o: any) => o.sub_id);
  if (!sub?.sub_id) return { ok: false, reason: 'no_subscription' } as const;
  const stripe = newStripeClient().stripe();
  const subscription = await stripe.subscriptions.retrieve(sub.sub_id as string);
  const customerId = subscription.customer as string;
  if (!customerId) return { ok: false, reason: 'no_customer' } as const;

  const qty = Math.max(1, Math.ceil(minutes));
  const amount = qty * centsPerMinute; // USD cents
  const desc = `High-accuracy overage ${qty} min @ $${(centsPerMinute/100).toFixed(2)}/min`;
  await stripe.invoiceItems.create({
    customer: customerId,
    currency: 'usd',
    amount,
    description: desc
  });
  return { ok: true } as const;
}

