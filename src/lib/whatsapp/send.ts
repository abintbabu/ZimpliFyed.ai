import 'server-only';
import { prisma } from '@/lib/prisma';
import { getCredential } from '@/lib/crypto/vault';
import { sessionWindow } from '@/lib/whatsapp-window';

/**
 * WhatsApp Cloud API outbound — template sends only (ROADMAP §7 item 3; CPO decision 2026-08-31:
 * the send path exists solely as an action-queue consumer / reply-in-thread, no free-compose surface).
 *
 * Credentials are per-tenant IntegrationCredential rows (kind "whatsapp"), the secret being a
 * JSON.stringify'd { accessToken, phoneNumberId } sealed by the vault — never global env vars.
 *
 * DPDP consent gate (ROADMAP §7 item 4): every send first requires an active granted ConsentRecord
 * for (tenantId, channel: whatsapp, identifier: recipient). No consent → the send throws
 * `consent_missing`; callers surface that, they never bypass it.
 */

export type WhatsAppSendErrorCode = 'consent_missing' | 'no_credential' | 'bad_credential' | 'api_error' | 'outside_window' | 'bad_message';

export class WhatsAppSendError extends Error {
  constructor(
    public readonly code: WhatsAppSendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WhatsAppSendError';
  }
}

/** Shape of the vault secret for kind "whatsapp". */
type WhatsAppCredential = { accessToken: string; phoneNumberId: string };

export interface SendWhatsAppTemplateInput {
  tenantId: string;
  /** Recipient phone number (E.164 without "+" per Meta convention, e.g. "9198…"). */
  to: string;
  /** Meta-approved template name, e.g. "quote_sent" | "tracking_update" | "payment_reminder". */
  template: string;
  /** BCP-47 template language; defaults to "en". */
  language?: string;
  /** Positional {{1}}, {{2}}… body parameters, in order. */
  bodyParams?: string[];
  /** IntegrationCredential sub-account (a specific business number); empty = tenant default. */
  account?: string;
}

const GRAPH_VERSION = 'v21.0';

/** Hard DPDP gate — consent is checked here so no caller can forget it. */
async function requireConsent(tenantId: string, to: string) {
  const consent = await prisma.consentRecord.findUnique({
    where: { tenantId_channel_identifier: { tenantId, channel: 'whatsapp', identifier: to } },
    select: { status: true },
  });
  if (!consent || consent.status !== 'granted') {
    throw new WhatsAppSendError('consent_missing', `No granted WhatsApp consent on record for ${to}`);
  }
}

async function loadCredential(tenantId: string, account: string): Promise<WhatsAppCredential> {
  const secret = await getCredential({ tenantId, kind: 'whatsapp', account });
  if (!secret) throw new WhatsAppSendError('no_credential', 'No active WhatsApp credential is connected for this workspace');
  try {
    const cred = JSON.parse(secret) as WhatsAppCredential;
    if (!cred.accessToken || !cred.phoneNumberId) throw new Error('missing fields');
    return cred;
  } catch {
    throw new WhatsAppSendError('bad_credential', 'Stored WhatsApp credential is malformed');
  }
}

async function postMessage(cred: WhatsAppCredential, body: unknown): Promise<{ messageId: string }> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cred.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cred.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new WhatsAppSendError('api_error', `WhatsApp API ${res.status}: ${detail.slice(0, 500)}`);
  }
  const json = (await res.json()) as { messages?: { id?: string }[] };
  return { messageId: json.messages?.[0]?.id ?? 'unknown' };
}

/**
 * Send a WhatsApp template message via the Meta Cloud API `/messages` endpoint.
 * Throws {@link WhatsAppSendError} on missing consent, missing/corrupt credential, or API failure.
 * Returns the Meta message id (wamid) on success.
 */
export async function sendWhatsAppTemplate(input: SendWhatsAppTemplateInput): Promise<{ messageId: string }> {
  await requireConsent(input.tenantId, input.to);
  const cred = await loadCredential(input.tenantId, input.account ?? '');

  const body = {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: {
      name: input.template,
      language: { code: input.language ?? 'en' },
      ...(input.bodyParams?.length
        ? {
            components: [
              { type: 'body', parameters: input.bodyParams.map((text) => ({ type: 'text', text })) },
            ],
          }
        : {}),
    },
  };

  return postMessage(cred, body);
}

/** Parse an ActionQueueItem payload into a template-send input, or null if it isn't a WhatsApp send. */
export function parseWhatsAppSendPayload(
  payload: unknown,
): Omit<SendWhatsAppTemplateInput, 'tenantId'> | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.channel !== 'whatsapp') return null;
  if (typeof p.to !== 'string' || typeof p.template !== 'string') return null;
  return {
    to: p.to,
    template: p.template,
    language: typeof p.language === 'string' ? p.language : undefined,
    bodyParams: Array.isArray(p.bodyParams) ? p.bodyParams.map(String) : undefined,
    account: typeof p.account === 'string' ? p.account : undefined,
  };
}

export interface SendWhatsAppSessionInput {
  tenantId: string;
  /** Recipient, E.164 digits without "+". */
  to: string;
  text: string;
  account?: string;
}

const MAX_SESSION_TEXT = 4096;

/**
 * Free-form (session) message. Meta only permits these within 24 hours of the customer's last inbound
 * message; outside that window only an approved template may be sent, and this throws `outside_window` rather
 * than letting the API reject it. The consent gate and the action-queue approval both still apply.
 */
export async function sendWhatsAppSessionMessage(input: SendWhatsAppSessionInput): Promise<{ messageId: string }> {
  const text = input.text.trim();
  if (!text) throw new WhatsAppSendError('bad_message', 'The message is empty');
  if (text.length > MAX_SESSION_TEXT) throw new WhatsAppSendError('bad_message', `The message is over ${MAX_SESSION_TEXT} characters`);

  await requireConsent(input.tenantId, input.to);

  const last = await prisma.inboxMessage.findFirst({
    where: { tenantId: input.tenantId, channel: { kind: 'whatsapp' }, fromAddress: { in: [input.to, `+${input.to}`] } },
    orderBy: { receivedAt: 'desc' },
    select: { receivedAt: true },
  });
  if (!sessionWindow(last?.receivedAt ?? null, new Date()).open) {
    throw new WhatsAppSendError('outside_window', `${input.to} has not messaged in the last 24 hours — only an approved template can be sent`);
  }

  const cred = await loadCredential(input.tenantId, input.account ?? '');
  return postMessage(cred, { messaging_product: 'whatsapp', to: input.to, type: 'text', text: { body: text, preview_url: false } });
}

/** Parse an ActionQueueItem payload into a session-message input, or null if it isn't one. */
export function parseWhatsAppSessionPayload(payload: unknown): Omit<SendWhatsAppSessionInput, 'tenantId'> | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.channel !== 'whatsapp' || typeof p.template === 'string') return null;
  if (typeof p.to !== 'string' || !/^\d{8,15}$/.test(p.to) || typeof p.text !== 'string') return null;
  return { to: p.to, text: p.text, account: typeof p.account === 'string' ? p.account : undefined };
}
