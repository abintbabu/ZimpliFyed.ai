import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/billing/stripe-client';
import { reduceStripeEvent } from '@/lib/billing/stripe-reducer';

/** Stripe webhook endpoint (BILLING_SPEC §2). Signature-verified, idempotent via WebhookEvent — a replayed
 * event ID short-circuits before the reducer runs, so retries and duplicate deliveries are safe. */
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    await prisma.webhookEvent.create({ data: { provider: 'stripe', eventId: event.id } });
  } catch {
    // Unique constraint on (provider, eventId) — already processed, ack without re-running the reducer.
    return NextResponse.json({ received: true, deduped: true });
  }

  await reduceStripeEvent(event);
  return NextResponse.json({ received: true });
}
