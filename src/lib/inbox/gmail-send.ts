import 'server-only';
import { getCredential } from '@/lib/crypto/vault';

/**
 * Gmail reply-in-thread send (ROADMAP §7 item 5; CPO 2026-08-31: send exists only as a reply-in-thread on
 * an existing InboxMessage, driven through the Action Queue — no free-compose surface). Mirrors the
 * credential/token pattern in gmail.ts (fetch-based, refresh-token-only vault secret).
 *
 * Reply threading: Gmail's API accepts a raw RFC 2822 message; setting In-Reply-To/References to the
 * original Message-ID and posting with threadId keeps it in the same thread and Gmail UI conversation.
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailCredential = { refresh_token: string; client_id: string; client_secret: string };

export type GmailSendErrorCode = 'no_credential' | 'bad_credential' | 'original_not_found' | 'api_error';

export class GmailSendError extends Error {
  constructor(
    public readonly code: GmailSendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GmailSendError';
  }
}

function parseCredential(raw: string): GmailCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GmailSendError('bad_credential', 'Stored Gmail credential is not valid JSON');
  }
  const c = parsed as Partial<GmailCredential>;
  if (!c.refresh_token || !c.client_id || !c.client_secret) {
    throw new GmailSendError('bad_credential', 'Gmail credential must contain refresh_token, client_id and client_secret');
  }
  return c as GmailCredential;
}

async function accessToken(cred: GmailCredential): Promise<string> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cred.refresh_token,
      client_id: cred.client_id,
      client_secret: cred.client_secret,
    }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new GmailSendError('bad_credential', `Gmail token refresh failed: ${json.error_description ?? res.statusText}`);
  }
  return json.access_token;
}

type GmailHeader = { name: string; value: string };
type GmailOriginal = { threadId: string; payload?: { headers?: GmailHeader[] } };

function header(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface SendGmailReplyInput {
  tenantId: string;
  /** IntegrationCredential sub-account (a specific mailbox); empty = tenant default. */
  account: string;
  /** The original inbound message's Gmail id (InboxMessage.externalMessageId) being replied to. */
  originalExternalMessageId: string;
  fromAddress: string;
  body: string;
}

/** Send a reply-in-thread on an existing Gmail message. Returns the sent message's Gmail id. */
export async function sendGmailReply(input: SendGmailReplyInput): Promise<{ messageId: string }> {
  const raw = await getCredential({ tenantId: input.tenantId, kind: 'gmail', account: input.account });
  if (!raw) throw new GmailSendError('no_credential', 'No active Gmail credential is connected for this workspace');
  const cred = parseCredential(raw);
  const token = await accessToken(cred);

  const origRes = await fetch(`${GMAIL_BASE}/messages/${input.originalExternalMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!origRes.ok) {
    throw new GmailSendError('original_not_found', `Original message not found on Gmail (${origRes.status})`);
  }
  const original = (await origRes.json()) as GmailOriginal;
  const messageIdHeader = header(original.payload?.headers, 'Message-ID');
  const origSubject = header(original.payload?.headers, 'Subject') ?? '';
  const replySubject = origSubject.toLowerCase().startsWith('re:') ? origSubject : `Re: ${origSubject}`;

  const lines = [
    `To: ${input.fromAddress}`,
    `Subject: ${replySubject}`,
    ...(messageIdHeader ? [`In-Reply-To: ${messageIdHeader}`, `References: ${messageIdHeader}`] : []),
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    input.body,
  ];
  const raw822 = encodeBase64Url(lines.join('\r\n'));

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: raw822, threadId: original.threadId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GmailSendError('api_error', `Gmail send failed (${res.status}): ${detail.slice(0, 500)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { messageId: json.id ?? 'unknown' };
}

/** Parse an ActionQueueItem payload into a Gmail-reply send input, or null if it isn't one. */
export function parseGmailReplyPayload(
  payload: unknown,
): { originalExternalMessageId: string; fromAddress: string; body: string; account: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.channel !== 'gmail_reply') return null;
  if (
    typeof p.originalExternalMessageId !== 'string' ||
    typeof p.fromAddress !== 'string' ||
    typeof p.body !== 'string'
  ) {
    return null;
  }
  return {
    originalExternalMessageId: p.originalExternalMessageId,
    fromAddress: p.fromAddress,
    body: p.body,
    account: typeof p.account === 'string' ? p.account : '',
  };
}
