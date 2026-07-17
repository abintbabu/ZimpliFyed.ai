import 'server-only';
import { getCredential } from '@/lib/crypto/vault';
import type { FetchArgs, FetchResult, InboxProvider, NormalizedMessage } from './provider';
import { ProviderNotConfiguredError } from './provider';

/**
 * Gmail live connector (INBOX_SPEC; CTO integrations posture — Gmail via CASA-reviewed OAuth, never IMAP
 * scraping). Dependency-free: the Gmail REST API is a handful of endpoints, so a thin fetch client keeps the
 * bundle and dependency surface down (mirrors razorpay-client.ts).
 *
 * Credential shape (stored in the vault under kind "gmail", account = channel.account), a JSON string:
 *   { "refresh_token": "...", "client_id": "...", "client_secret": "..." }
 * We hold only a long-lived refresh token — the short-lived access token is minted per sync, so a stored
 * secret never goes stale and there is no access-token expiry bookkeeping on the channel.
 *
 * Incremental sync uses Gmail's history API keyed on the channel's lastSyncCursor (a Gmail historyId). First
 * run (cursor null) seeds from the last 7 days of INBOX and records the mailbox's current historyId as the
 * watermark. Idempotency is guaranteed downstream: syncChannel upserts on (channelId, externalMessageId).
 */

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SEED_WINDOW_DAYS = 7;

type GmailCredential = { refresh_token: string; client_id: string; client_secret: string };

function parseCredential(raw: string, account: string): GmailCredential {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gmail credential for account "${account || 'default'}" is not valid JSON`);
  }
  const c = parsed as Partial<GmailCredential>;
  if (!c.refresh_token || !c.client_id || !c.client_secret) {
    throw new Error('Gmail credential must contain refresh_token, client_id and client_secret');
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
    throw new Error(`Gmail token refresh failed: ${json.error_description ?? res.statusText}`);
  }
  return json.access_token;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const err = (json as { error?: { message?: string } })?.error?.message ?? res.statusText;
    const status = res.status;
    // Surface a typed sentinel so the history-expiry fallback can catch it.
    throw Object.assign(new Error(`Gmail ${path} failed (${status}): ${err}`), { status });
  }
  return json as T;
}

type GmailProfile = { historyId: string };
type GmailListMessages = { messages?: { id: string }[]; nextPageToken?: string };
type GmailHistory = { history?: { messagesAdded?: { message: { id: string } }[] }[]; historyId?: string };
type GmailHeader = { name: string; value: string };
type GmailPart = { mimeType?: string; body?: { data?: string; size?: number }; parts?: GmailPart[] };
type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[]; mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
};

function header(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Parse "Display Name <addr@x.com>" into its parts. */
function parseFrom(value: string | undefined): { name: string | null; address: string | null } {
  if (!value) return { name: null, address: null };
  const m = value.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/);
  if (m) return { name: m[1]?.trim() || null, address: m[2].trim() };
  return { name: null, address: value.trim() };
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Walk the MIME tree, preferring text/plain, falling back to a tag-stripped text/html. */
function extractBody(payload: GmailMessage['payload']): string {
  if (!payload) return '';
  let html = '';
  const visit = (part: GmailPart | NonNullable<GmailMessage['payload']>): string => {
    const mime = part.mimeType ?? '';
    if (mime === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
    if (mime === 'text/html' && part.body?.data) {
      html = decodeBase64Url(part.body.data);
      return '';
    }
    for (const child of part.parts ?? []) {
      const text = visit(child);
      if (text) return text;
    }
    return '';
  };
  const plain = visit(payload);
  if (plain) return plain;
  if (html) return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

async function normalize(token: string, id: string): Promise<NormalizedMessage> {
  const msg = await api<GmailMessage>(token, `/messages/${id}?format=full`);
  const from = parseFrom(header(msg.payload?.headers, 'From'));
  const receivedAt = msg.internalDate ? new Date(Number(msg.internalDate)) : new Date();
  return {
    externalMessageId: msg.id,
    fromName: from.name,
    fromAddress: from.address,
    subject: header(msg.payload?.headers, 'Subject') ?? null,
    body: extractBody(msg.payload),
    receivedAt,
  };
}

async function seedMessageIds(token: string): Promise<string[]> {
  const list = await api<GmailListMessages>(
    token,
    `/messages?q=${encodeURIComponent(`in:inbox newer_than:${SEED_WINDOW_DAYS}d`)}&maxResults=50`,
  );
  return (list.messages ?? []).map((m) => m.id);
}

async function incrementalMessageIds(token: string, startHistoryId: string): Promise<string[]> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded' });
    if (pageToken) qs.set('pageToken', pageToken);
    const page = await api<GmailHistory & { nextPageToken?: string }>(token, `/history?${qs.toString()}`);
    for (const h of page.history ?? []) {
      for (const added of h.messagesAdded ?? []) ids.add(added.message.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...ids];
}

export const gmailProvider: InboxProvider = {
  kind: 'gmail',
  canPull: true,
  async fetch(args: FetchArgs): Promise<FetchResult> {
    const raw = await getCredential({ tenantId: args.tenantId, kind: 'gmail', account: args.account });
    if (!raw) throw new ProviderNotConfiguredError('gmail');
    const cred = parseCredential(raw, args.account);
    const token = await accessToken(cred);

    // Current mailbox historyId is always the next watermark, whether or not this pull found anything.
    const profile = await api<GmailProfile>(token, '/profile');

    let messageIds: string[];
    if (!args.cursor) {
      messageIds = await seedMessageIds(token);
    } else {
      try {
        messageIds = await incrementalMessageIds(token, args.cursor);
      } catch (err) {
        // A historyId older than Gmail retains (~1 week) returns 404 — fall back to a bounded re-seed
        // rather than stalling the channel. Downstream upsert dedupes any overlap.
        if ((err as { status?: number }).status === 404) messageIds = await seedMessageIds(token);
        else throw err;
      }
    }

    const messages: NormalizedMessage[] = [];
    for (const id of messageIds) {
      messages.push(await normalize(token, id));
    }

    return { messages, cursor: profile.historyId };
  },
};
