import { NextRequest, NextResponse } from 'next/server';
import { getUserUuid } from '@/services/user';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  try {
    const userUuid = await getUserUuid();
    if (!userUuid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const [user] = await db().select().from(users).where(eq(users.uuid, userUuid)).limit(1);
    const customerId = (user as any)?.stripe_customer_id;
    if (!customerId) return NextResponse.json({ error: 'no_stripe_customer' }, { status: 400 });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY!, { apiVersion: '2024-11-20.acacia' });
    const origin = new URL(req.url).origin;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard/account`
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('[Billing Portal] create error', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}

