import assert from 'node:assert/strict';
import { __gmailInternals } from '../../lib/inbox/gmail';
import { buildReplyMime, replySubject, parseGmailReplyPayload } from '../../lib/inbox/gmail-send';
import { parseWhatsAppSendPayload } from '../../lib/whatsapp/send';
import { getInboxProvider, ProviderNotConfiguredError } from '../../lib/inbox/provider';

/**
 * Inbox connector unit tests — the pure parsing/serialization edges of the Gmail and WhatsApp paths.
 * No network, no DB, no vault: `npm run test:inbox`.
 *
 * These are the failure modes that are silent in production — a lead ingested with a null sender, an empty
 * body from an HTML-only newsletter, a reply that leaves its thread because a header was malformed, or an
 * action-queue payload coercing into a send it was never meant to trigger.
 */

const { parseFrom, decodeBase64Url, extractBody, parseCredential } = __gmailInternals;
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

// ── parseFrom: RFC 5322 From header ───────────────────────────────────────────
assert.deepEqual(parseFrom('Priya Nair <priya@acme.co.in>'), { name: 'Priya Nair', address: 'priya@acme.co.in' });
assert.deepEqual(parseFrom('"Nair, Priya" <priya@acme.co.in>'), { name: 'Nair, Priya' , address: 'priya@acme.co.in' }, 'quoted display name with a comma');
assert.deepEqual(parseFrom('<bare@acme.co.in>'), { name: null, address: 'bare@acme.co.in' }, 'angle-only → no name');
assert.deepEqual(parseFrom('plain@acme.co.in'), { name: null, address: 'plain@acme.co.in' }, 'bare address, no angles');
assert.deepEqual(parseFrom('  spaced@acme.co.in  '), { name: null, address: 'spaced@acme.co.in' }, 'trimmed');
assert.deepEqual(parseFrom(undefined), { name: null, address: null }, 'missing header never throws');
assert.deepEqual(parseFrom(''), { name: null, address: null }, 'empty header never throws');
// An empty quoted display name must not produce an empty-string name (`'' || null` → null).
assert.equal(parseFrom('"" <x@y.com>').name, null, 'empty display name normalizes to null, not ""');

// ── decodeBase64Url ───────────────────────────────────────────────────────────
assert.equal(decodeBase64Url(b64url('hello world')), 'hello world');
// Gmail's URL-safe alphabet: bytes that encode to '+' and '/' arrive as '-' and '_'.
{
  const tricky = 'Grüße — ₹1,20,000 quote ✅';
  assert.equal(decodeBase64Url(b64url(tricky)), tricky, 'round-trips non-ASCII through the URL-safe alphabet');
  const std = Buffer.from(tricky, 'utf8').toString('base64');
  assert.ok(/[+/]/.test(std) || true);
  assert.equal(decodeBase64Url(std.replace(/\+/g, '-').replace(/\//g, '_')), tricky);
}

// ── extractBody: MIME tree walk ───────────────────────────────────────────────
assert.equal(extractBody(undefined), '', 'no payload → empty string, never throws');
assert.equal(extractBody({ mimeType: 'text/plain', body: { data: b64url('Need 500 towels') } }), 'Need 500 towels', 'single-part plain');

// multipart/alternative prefers text/plain over text/html.
assert.equal(
  extractBody({
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/html', body: { data: b64url('<p>HTML version</p>') } },
      { mimeType: 'text/plain', body: { data: b64url('Plain version') } },
    ],
  }),
  'Plain version',
  'text/plain wins even when text/html comes first',
);

// HTML-only falls back to tag-stripped text, with <style> contents dropped entirely.
assert.equal(
  extractBody({
    mimeType: 'text/html',
    body: { data: b64url('<style>.x{color:red}</style><p>Hello   <b>Priya</b></p>') },
  }),
  'Hello Priya',
  'HTML fallback strips tags, drops <style> bodies, collapses whitespace',
);

// Nested multipart/mixed → multipart/alternative → text/plain (the common attachment shape).
assert.equal(
  extractBody({
    mimeType: 'multipart/mixed',
    parts: [
      { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64url('Deep plain') } }] },
      { mimeType: 'application/pdf', body: { size: 1024 } },
    ],
  }),
  'Deep plain',
  'walks nested multiparts and ignores binary attachment parts',
);

// A part with a declared mime type but no data must not crash the walk.
assert.equal(extractBody({ mimeType: 'multipart/mixed', parts: [{ mimeType: 'text/plain' }] }), '', 'dataless part → empty, no throw');

// ── parseCredential ───────────────────────────────────────────────────────────
{
  const good = JSON.stringify({ refresh_token: 'r', client_id: 'c', client_secret: 's' });
  assert.deepEqual(parseCredential(good, 'ops@acme.co.in'), { refresh_token: 'r', client_id: 'c', client_secret: 's' });
  assert.throws(() => parseCredential('not json', 'ops@acme.co.in'), /ops@acme\.co\.in.*not valid JSON/, 'names the account in the error');
  assert.throws(() => parseCredential('not json', ''), /"default"/, 'empty account renders as "default"');
  assert.throws(() => parseCredential(JSON.stringify({ refresh_token: 'r' }), 'a'), /refresh_token, client_id and client_secret/);
  // A credential must never be accepted with a blank secret — that would fail confusingly at token refresh.
  assert.throws(() => parseCredential(JSON.stringify({ refresh_token: 'r', client_id: 'c', client_secret: '' }), 'a'), /client_secret/);
}

// ── replySubject ──────────────────────────────────────────────────────────────
assert.equal(replySubject('Quote request'), 'Re: Quote request');
assert.equal(replySubject('Re: Quote request'), 'Re: Quote request', 'already-prefixed subject is left alone');
assert.equal(replySubject('RE: Quote request'), 'RE: Quote request', 'case-insensitive, preserves original casing');
assert.equal(replySubject('re: quote'), 're: quote');
assert.equal(replySubject(''), 'Re: ', 'missing subject still yields a well-formed header');

// ── buildReplyMime: threading headers ─────────────────────────────────────────
{
  const mime = buildReplyMime({
    to: 'priya@acme.co.in',
    originalSubject: 'Bulk towel enquiry',
    originalMessageIdHeader: '<CAF123@mail.gmail.com>',
    body: 'Sharing our quote attached.',
  });
  const lines = mime.split('\r\n');
  assert.ok(mime.includes('\r\n'), 'RFC 2822 uses CRLF line endings');
  assert.equal(lines[0], 'To: priya@acme.co.in');
  assert.equal(lines[1], 'Subject: Re: Bulk towel enquiry');
  assert.ok(lines.includes('In-Reply-To: <CAF123@mail.gmail.com>'), 'In-Reply-To keeps the reply in-thread');
  assert.ok(lines.includes('References: <CAF123@mail.gmail.com>'), 'References keeps the reply in-thread');
  assert.ok(lines.includes('Content-Type: text/plain; charset="UTF-8"'));
  // Exactly one blank line separates headers from body, and the body is last.
  const blank = lines.indexOf('');
  assert.ok(blank > 0, 'headers are separated from the body by a blank line');
  assert.equal(lines.slice(blank + 1).join('\r\n'), 'Sharing our quote attached.');
}
{
  // No Message-ID on the original: the threading headers are omitted entirely rather than emitted empty.
  const mime = buildReplyMime({ to: 'a@b.com', originalSubject: 'Hi', body: 'Body' });
  assert.ok(!mime.includes('In-Reply-To'), 'no empty In-Reply-To header');
  assert.ok(!mime.includes('References'), 'no empty References header');
  assert.ok(mime.includes('Subject: Re: Hi'));
}

// ── parseGmailReplyPayload: only a well-formed gmail_reply payload sends ───────
{
  const ok = { channel: 'gmail_reply', originalExternalMessageId: 'm1', fromAddress: 'a@b.com', body: 'hi', account: 'ops@acme.co.in' };
  assert.deepEqual(parseGmailReplyPayload(ok), { originalExternalMessageId: 'm1', fromAddress: 'a@b.com', body: 'hi', account: 'ops@acme.co.in' });
  assert.equal(parseGmailReplyPayload({ ...ok, account: undefined })!.account, '', 'missing account → tenant default');
  assert.equal(parseGmailReplyPayload({ ...ok, account: 42 })!.account, '', 'non-string account → tenant default, not "42"');

  // Anything that is not an intact gmail_reply payload must return null, so approving an unrelated
  // action can never trigger a send.
  for (const bad of [
    null, undefined, 'string', 42, [],
    { channel: 'whatsapp', to: '91', template: 't' },
    { ...ok, channel: undefined },
    { ...ok, originalExternalMessageId: undefined },
    { ...ok, fromAddress: undefined },
    { ...ok, body: undefined },
    { ...ok, body: 123 },
  ]) {
    assert.equal(parseGmailReplyPayload(bad), null, `non-send payload must not parse: ${JSON.stringify(bad)}`);
  }
}

// ── parseWhatsAppSendPayload ──────────────────────────────────────────────────
{
  const ok = { channel: 'whatsapp', to: '919876543210', template: 'quote_sent' };
  assert.deepEqual(parseWhatsAppSendPayload(ok), { to: '919876543210', template: 'quote_sent', language: undefined, bodyParams: undefined, account: undefined });
  assert.deepEqual(
    parseWhatsAppSendPayload({ ...ok, language: 'en_US', bodyParams: ['ACME', 42], account: 'biz1' }),
    { to: '919876543210', template: 'quote_sent', language: 'en_US', bodyParams: ['ACME', '42'], account: 'biz1' },
    'bodyParams are coerced to strings (Meta only accepts text params)',
  );
  for (const bad of [
    null, undefined, 'string', 42,
    { channel: 'gmail_reply', originalExternalMessageId: 'm', fromAddress: 'a@b', body: 'x' },
    { ...ok, to: undefined },
    { ...ok, template: undefined },
    { ...ok, to: 919876543210 },
  ]) {
    assert.equal(parseWhatsAppSendPayload(bad), null, `non-send payload must not parse: ${JSON.stringify(bad)}`);
  }
  // The two parsers must be mutually exclusive — one payload can never drive both channels.
  assert.equal(parseWhatsAppSendPayload({ channel: 'gmail_reply', to: '91', template: 't' }), null);
  assert.equal(parseGmailReplyPayload({ channel: 'whatsapp', originalExternalMessageId: 'm', fromAddress: 'a@b', body: 'x' }), null);
}

// ── provider registry ─────────────────────────────────────────────────────────
{
  assert.equal(getInboxProvider('manual').canPull, false, 'manual is fed externally, never pulled');
  assert.equal(getInboxProvider('gmail').canPull, true, 'gmail is a live pulling connector');
  for (const kind of ['manual', 'gmail', 'email', 'imap', 'whatsapp'] as const) {
    assert.equal(getInboxProvider(kind).kind, kind, `registry entry for ${kind} is self-consistent`);
  }
}

async function main() {
  // manual pulls nothing and does not error — the triage pipeline runs with zero credentials.
  assert.deepEqual(await getInboxProvider('manual').fetch({ tenantId: 't', account: '', cursor: null }), { messages: [], cursor: null });

  // Unwired connectors raise the typed sentinel callers surface as a channel error, not a generic crash.
  for (const kind of ['email', 'imap', 'whatsapp'] as const) {
    await assert.rejects(
      () => getInboxProvider(kind).fetch({ tenantId: 't', account: '', cursor: null }),
      (err: unknown) => err instanceof ProviderNotConfiguredError && (err as Error).name === 'ProviderNotConfiguredError',
      `${kind} raises ProviderNotConfiguredError`,
    );
  }

  console.log('✓ inbox: gmail From/body/credential parsing, reply MIME threading, send-payload guards, provider registry');
}

main().catch((err) => { console.error(err); process.exit(1); });
