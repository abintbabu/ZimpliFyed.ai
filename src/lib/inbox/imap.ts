import 'server-only';
import { z } from 'zod';
import { ImapFlow } from 'imapflow';
import PostalMime from 'postal-mime';
import { getCredential } from '@/lib/crypto/vault';
import type { FetchArgs, FetchResult, InboxProvider, NormalizedMessage } from './types';
import { ProviderNotConfiguredError } from './types';
import { IMAP_PORT, resolvePublicAddress, validateImapPort } from './imap-safety';

/**
 * Generic IMAP connector (M12) — for the Zoho / Outlook / cPanel / custom-domain mailboxes most Indian SME
 * exporters actually use, which the Gmail-only connector cannot reach. Gmail stays on OAuth (CTO posture);
 * this is the fallback for everything else.
 *
 * Credential (vault kind "imap", a JSON string): { "host": "imap.example.com", "user": "...", "password": "..." }
 * — an app-specific password where the provider offers one. Never logged, never returned to the client.
 *
 * Safety: TLS-only on 993 with certificate verification; the host must be a public DNS name whose every
 * address is public (imap-safety.ts), and we dial the validated address, not the name. The mailbox is opened
 * READ-ONLY — syncing never marks mail read, moves or deletes it.
 *
 * Cursor: "<uidValidity>:<lastUid>". UIDs only grow within one UIDVALIDITY; if the server resets it, the
 * cursor is meaningless and we re-seed from the recent window (dedupe on Message-ID keeps that safe).
 */

export const SEED_WINDOW_DAYS = 7;
export const MAX_MESSAGES_PER_SYNC = 50;
const MAX_BODY_CHARS = 20_000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const CredentialSchema = z.object({
  host: z.string().min(1),
  user: z.string().min(1),
  password: z.string().min(1),
  port: z.number().int().optional(),
});
export type ImapCredential = z.infer<typeof CredentialSchema>;

export function parseImapCredential(raw: string): ImapCredential {
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error('IMAP credential must be JSON: {"host","user","password"}'); }
  const parsed = CredentialSchema.safeParse(json);
  if (!parsed.success) throw new Error('IMAP credential needs "host", "user" and "password".');
  const portProblem = validateImapPort(parsed.data.port ?? IMAP_PORT);
  if (portProblem) throw new Error(portProblem);
  return parsed.data;
}

export function formatCursor(uidValidity: number, lastUid: number): string {
  return `${uidValidity}:${lastUid}`;
}

export function parseCursor(cursor: string | null): { uidValidity: number; lastUid: number } | null {
  if (!cursor) return null;
  const m = /^(\d+):(\d+)$/.exec(cursor);
  return m ? { uidValidity: Number(m[1]), lastUid: Number(m[2]) } : null;
}

/** The slice of an IMAP session the sync logic needs — small enough to fake in tests. */
export interface ImapSession {
  readonly uidValidity: number;
  searchSince(since: Date): Promise<number[]>;
  searchAfterUid(uid: number): Promise<number[]>;
  fetchSources(uids: number[]): AsyncIterable<{ uid: number; source: Buffer; internalDate?: Date | null }>;
  close(): Promise<void>;
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Parses one raw RFC 822 message into the shared inbox shape. Never throws on a malformed message. */
export async function normalizeImapMessage(
  uid: number, uidValidity: number, source: Buffer, internalDate?: Date | null,
): Promise<NormalizedMessage> {
  const fallbackId = `imap:${uidValidity}:${uid}`;
  try {
    const mail = await PostalMime.parse(source);
    const body = (mail.text?.trim() || (mail.html ? htmlToText(mail.html) : '')).slice(0, MAX_BODY_CHARS);
    const received = mail.date && !Number.isNaN(Date.parse(mail.date)) ? new Date(mail.date) : internalDate ?? new Date();
    return {
      // Message-ID survives a UIDVALIDITY reset and is what keeps a re-seed from duplicating rows.
      externalMessageId: mail.messageId?.trim() ? `imap:${mail.messageId.trim()}` : fallbackId,
      fromName: mail.from?.name?.trim() || null,
      fromAddress: mail.from?.address?.trim() || null,
      subject: mail.subject?.trim() || null,
      body: body || '(no text content)',
      receivedAt: received,
    };
  } catch {
    return { externalMessageId: fallbackId, fromName: null, fromAddress: null, subject: null, body: '(message could not be parsed)', receivedAt: internalDate ?? new Date() };
  }
}

/** Core sync over an already-open session — all the cursor / limit logic, no network. */
export async function syncImapSession(session: ImapSession, cursor: string | null, now = new Date()): Promise<FetchResult> {
  const prev = parseCursor(cursor);
  const usable = prev && prev.uidValidity === session.uidValidity ? prev : null;

  const uids = usable
    ? await session.searchAfterUid(usable.lastUid)
    : await session.searchSince(new Date(now.getTime() - SEED_WINDOW_DAYS * 86_400_000));

  // `uid:*` always returns the newest message even when it is not newer than the cursor — filter strictly.
  const floor = usable?.lastUid ?? 0;
  const batch = [...new Set(uids)].filter((u) => u > floor).sort((a, b) => a - b).slice(0, MAX_MESSAGES_PER_SYNC);
  if (batch.length === 0) return { messages: [], cursor: usable ? formatCursor(session.uidValidity, usable.lastUid) : formatCursor(session.uidValidity, 0) };

  const messages: NormalizedMessage[] = [];
  let lastUid = floor;
  for await (const m of session.fetchSources(batch)) {
    lastUid = Math.max(lastUid, m.uid);
    if (m.source.length > MAX_SOURCE_BYTES) {
      messages.push({ externalMessageId: `imap:${session.uidValidity}:${m.uid}`, body: '(message too large to import)', receivedAt: m.internalDate ?? now, subject: null, fromName: null, fromAddress: null });
      continue;
    }
    messages.push(await normalizeImapMessage(m.uid, session.uidValidity, m.source, m.internalDate));
  }
  return { messages, cursor: formatCursor(session.uidValidity, Math.max(lastUid, batch[batch.length - 1])) };
}

async function openSession(cred: ImapCredential): Promise<ImapSession> {
  const address = await resolvePublicAddress(cred.host);
  const client = new ImapFlow({
    host: address,                      // the validated address — not the name — so DNS cannot change under us
    port: IMAP_PORT,
    secure: true,
    servername: cred.host.trim().toLowerCase(), // SNI + certificate verification against the real name
    auth: { user: cred.user, pass: cred.password },
    logger: false,                      // the default logger can echo protocol lines
    tls: { rejectUnauthorized: true, servername: cred.host.trim().toLowerCase() },
    socketTimeout: 30_000,
    greetingTimeout: 15_000,
    connectionTimeout: 15_000,
  });
  client.on('error', () => { /* surfaced through the rejected promise; swallow the emitter event so it can't crash the process */ });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX', { readOnly: true });
  const mailbox = client.mailbox;
  if (!mailbox || typeof mailbox === 'boolean') { lock.release(); await client.logout().catch(() => {}); throw new Error('Could not open INBOX'); }
  const uidValidity = Number(mailbox.uidValidity);

  return {
    uidValidity,
    async searchSince(since) { return ((await client.search({ since }, { uid: true })) || []) as number[]; },
    async searchAfterUid(uid) { return ((await client.search({ uid: `${uid + 1}:*` }, { uid: true })) || []) as number[]; },
    async *fetchSources(uids) {
      for await (const msg of client.fetch(uids.join(','), { uid: true, source: true, internalDate: true }, { uid: true })) {
        if (msg.source) yield { uid: msg.uid, source: msg.source, internalDate: msg.internalDate instanceof Date ? msg.internalDate : null };
      }
    },
    async close() { lock.release(); await client.logout().catch(() => {}); },
  };
}

export const imapProvider: InboxProvider = {
  kind: 'imap',
  canPull: true,
  async fetch(args: FetchArgs): Promise<FetchResult> {
    const raw = await getCredential({ tenantId: args.tenantId, kind: 'imap', account: args.account });
    if (!raw) throw new ProviderNotConfiguredError('imap');
    const cred = parseImapCredential(raw);
    const session = await openSession(cred);
    try {
      return await syncImapSession(session, args.cursor);
    } finally {
      await session.close();
    }
  },
};

export const __imapInternals = { htmlToText };
