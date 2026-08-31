import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWebhookSignature } from '@/lib/billing/razorpay-client';
import { reduceRazorpayEvent } from '@/lib/billing/razorpay-reducer';
import { reportError } from '@/lib/observability';

/** Razorpay webhook endpoint (BILLING_SPEC §2; DEV_PLAN_100 Sprint 1). Signature-verified (HMAC-SHA256 of
 * the raw body), idempotent via WebhookEvent — a replayed delivery short-circuits before the reducer runs.
 * Razorpay does not send a globally-unique event id header, so we dedupe on the x-razorpay-event-id header
 * it does send per delivery. */
export async function POST(req: Request) {
  const signature = req.headers.get('x-razorpay-signature');
  const body = await req.text();

  if (!verifyWebhookSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const eventId = req.headers.get('x-razorpay-event-id');
  if (eventId) {
    try {
      await prisma.webhookEvent.create({ data: { provider: 'razorpay', eventId } });
    } catch {
      // Unique (provider, eventId) — already processed; ack without re-running the reducer.
      return NextResponse.json({ received: true, deduped: true });
    }
  }

  const event = JSON.parse(body);
  try {
    await reduceRazorpayEvent(event);
  } catch (err) {
    // Reducer failed after the event was recorded — surface to Sentry and 500 so Razorpay retries.
    await reportError(err, { source: 'webhook.razorpay', eventId, eventType: event?.event });
    if (eventId) await prisma.webhookEvent.deleteMany({ where: { provider: 'razorpay', eventId } });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
