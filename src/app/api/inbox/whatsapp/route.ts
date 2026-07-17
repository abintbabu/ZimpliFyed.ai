import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enqueue } from '@/lib/jobs/queue';

/**
 * WhatsApp Business (Meta Cloud API) inbound webhook (INBOX_SPEC; CTO integrations posture — WhatsApp via Meta
 * Cloud API). WhatsApp is push-native: Meta POSTs inbound messages here, so this is the whatsapp channel's
 * ingestion path (the pull-based InboxProvider stub is never exercised for it).
 *
 *   GET  — Meta's one-time subscription handshake (echo hub.challenge when the verify token matches).
 *   POST — inbound message deliveries. Each is routed to the InboxChannel whose identifier is the business
 *          number that received it (metadata.phone_number_id), then persisted + queued for classification,
 *          reusing the same InboxMessage → inbox.ingest pipeline as the paste and Gmail paths.
 *
 * No session: the tenant is resolved from the matched channel, never from ambient context. Idempotent — a
 * redelivered wa message id upserts onto the same row.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

type WaText = { body?: string };
type WaMessage = { id: string; from: string; timestamp?: string; type: string; text?: WaText };
type WaContact = { wa_id: string; profile?: { name?: string } };
type WaValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: WaContact[];
  messages?: WaMessage[];
};
type WaPayload = { entry?: { changes?: { value?: WaValue }[] }[] };

/** Best-effort text extraction — we only triage text today; other media types are stored as a placeholder. */
function messageText(m: WaMessage): string {
  if (m.type === 'text' && m.text?.body) return m.text.body;
  return `[${m.type} message]`;
}

export async function POST(req: Request) {
  let payload: WaPayload;
  try {
    payload = (await req.json()) as WaPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      // Route to the channel watching this business number. Match on phone_number_id first (stable), then
      // fall back to the human-readable display number; either may be stored in the channel identifier.
      const phoneId = value.metadata?.phone_number_id;
      const displayNumber = value.metadata?.display_phone_number;
      const channel = await prisma.inboxChannel.findFirst({
        where: {
          kind: 'whatsapp',
          status: { not: 'paused' },
          OR: [
            ...(phoneId ? [{ identifier: phoneId }] : []),
            ...(displayNumber ? [{ identifier: displayNumber }] : []),
          ],
        },
        select: { id: true, tenantId: true },
      });
      if (!channel) continue; // no tenant has claimed this number — ignore

      const nameByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const m of value.messages) {
        const receivedAt = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
        const row = await prisma.inboxMessage.upsert({
          where: { channelId_externalMessageId: { channelId: channel.id, externalMessageId: m.id } },
          create: {
            tenantId: channel.tenantId,
            channelId: channel.id,
            externalMessageId: m.id,
            fromName: nameByWaId.get(m.from) ?? null,
            fromAddress: m.from,
            subject: null,
            body: messageText(m),
            receivedAt,
          },
          update: {},
          select: { id: true, category: true },
        });
        if (!row.category) {
          await enqueue({ tenantId: channel.tenantId, kind: 'inbox.ingest', payload: { messageId: row.id } });
        }
      }
    }
  }

  // Always 200 so Meta does not retry a delivery we have already accepted.
  return NextResponse.json({ received: true });
}
