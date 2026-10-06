import assert from 'node:assert/strict';
import { validateImapHost, validateImapPort, isPrivateAddress, resolvePublicAddress } from '../../lib/inbox/imap-safety';
import {
  parseImapCredential, parseCursor, formatCursor, normalizeImapMessage, syncImapSession,
  MAX_MESSAGES_PER_SYNC, __imapInternals, type ImapSession,
} from '../../lib/inbox/imap';
import { getInboxProvider } from '../../lib/inbox/provider';

/**
 * IMAP connector tests: `npm run test:imap`. No network, DB or vault — the SSRF guard, cursor/limit logic
 * (against a fake session) and MIME parsing (real postal-mime). The live ImapFlow adapter is NOT exercised
 * here; it needs a real mailbox.
 */

(async () => {
  // ── Host validation: only public DNS names ──────────────────────────────────
  assert.equal(validateImapHost('imap.zoho.in'), null);
  assert.equal(validateImapHost('  IMAP.Example.COM.  '), null, 'case/space/trailing-dot normalised');
  for (const bad of ['', 'localhost', 'LOCALHOST', 'db.internal', 'printer.local', 'x.localdomain', 'foo.home.arpa', 'nodots', 'a..b.com', '-bad.example.com', 'exa mple.com', 'imap_host.example.com']) {
    assert.notEqual(validateImapHost(bad), null, `"${bad}" must be rejected`);
  }
  for (const ip of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '8.8.8.8', '2130706433', '0x7f.1', '[::1]', '::1', '2001:db8::1']) {
    assert.match(validateImapHost(ip)!, /host name|not a valid/, `IP-ish literal "${ip}" must be rejected`);
  }
  assert.equal(validateImapPort(993), null);
  for (const p of [143, 25, 22, 6379, 80, 0]) assert.match(validateImapPort(p)!, /993/, `port ${p} refused`);

  // ── Private-address classification ──────────────────────────────────────────
  const privateIps = [
    '0.0.0.0', '10.1.2.3', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '100.64.0.1', '100.127.255.255', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2001:db8::5',
    'not-an-ip',
  ];
  for (const ip of privateIps) assert.equal(isPrivateAddress(ip), true, `${ip} must be treated as private`);
  const publicIps = ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '203.0.114.1', '2606:4700:4700::1111', '2a00:1450:4009:81f::200e', '::ffff:8.8.8.8'];
  for (const ip of publicIps) assert.equal(isPrivateAddress(ip), false, `${ip} is public`);

  // ── resolvePublicAddress: ALL records must be public ────────────────────────
  const fakeLookup = (records: { address: string; family: number }[]) => async () => records;
  assert.equal(await resolvePublicAddress('imap.example.com', fakeLookup([{ address: '93.184.216.34', family: 4 }])), '93.184.216.34');
  assert.equal(
    await resolvePublicAddress('imap.example.com', fakeLookup([{ address: '2606:2800:220:1::1', family: 6 }, { address: '93.184.216.34', family: 4 }])),
    '93.184.216.34', 'prefers IPv4',
  );
  await assert.rejects(resolvePublicAddress('imap.example.com', fakeLookup([{ address: '10.0.0.8', family: 4 }])), /private network/);
  await assert.rejects(
    resolvePublicAddress('imap.example.com', fakeLookup([{ address: '93.184.216.34', family: 4 }, { address: '169.254.169.254', family: 4 }])),
    /private network/, 'one private record among public ones is still a rejection (rebinding / split-horizon)',
  );
  await assert.rejects(resolvePublicAddress('imap.example.com', fakeLookup([])), /Could not resolve/);
  await assert.rejects(resolvePublicAddress('imap.example.com', async () => { throw new Error('ENOTFOUND'); }), /Could not resolve/);
  await assert.rejects(resolvePublicAddress('localhost', fakeLookup([{ address: '8.8.8.8', family: 4 }])), /private network/, 'syntax check runs before DNS');

  // ── Credential parsing ──────────────────────────────────────────────────────
  assert.deepEqual(parseImapCredential('{"host":"imap.zoho.in","user":"a@b.in","password":"pw"}'), { host: 'imap.zoho.in', user: 'a@b.in', password: 'pw' });
  assert.throws(() => parseImapCredential('not json'), /JSON/);
  assert.throws(() => parseImapCredential('{"host":"x.com","user":"u"}'), /host.*user.*password/);
  assert.throws(() => parseImapCredential('{"host":"x.com","user":"u","password":"p","port":143}'), /993/);
  assert.doesNotThrow(() => parseImapCredential('{"host":"x.com","user":"u","password":"p","port":993}'));

  // ── Cursor ──────────────────────────────────────────────────────────────────
  assert.equal(formatCursor(7, 120), '7:120');
  assert.deepEqual(parseCursor('7:120'), { uidValidity: 7, lastUid: 120 });
  for (const bad of [null, '', 'abc', '7', '7:', ':5', '7:x', '-1:2']) assert.equal(parseCursor(bad), null, `"${bad}" is not a cursor`);

  // ── MIME → message ──────────────────────────────────────────────────────────
  const eml = (extra = '', body = 'Hello,\r\nPlease quote 5000 towels FOB Chennai.\r\n') =>
    Buffer.from(`From: "Nair, Priya" <priya@acme.co.in>\r\nTo: sales@us.example\r\nSubject: RFQ towels\r\nMessage-ID: <abc123@acme.co.in>\r\nDate: Mon, 05 Oct 2026 10:00:00 +0000\r\n${extra}\r\n${body}`);
  {
    const m = await normalizeImapMessage(42, 7, eml());
    assert.equal(m.externalMessageId, 'imap:<abc123@acme.co.in>');
    assert.equal(m.fromName, 'Nair, Priya'); assert.equal(m.fromAddress, 'priya@acme.co.in'); assert.equal(m.subject, 'RFQ towels');
    assert.match(m.body, /5000 towels FOB Chennai/); assert.equal(m.receivedAt.toISOString(), '2026-10-05T10:00:00.000Z');
  }
  {
    const m = await normalizeImapMessage(9, 7, Buffer.from('Subject: no id\r\nFrom: x@y.com\r\n\r\nbody'));
    assert.equal(m.externalMessageId, 'imap:7:9', 'no Message-ID → falls back to uidValidity:uid');
  }
  {
    const html = Buffer.from('From: a@b.com\r\nMessage-ID: <h1>\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<style>p{}</style><p>Need <b>samples</b> &amp; prices</p><script>x()</script>');
    const m = await normalizeImapMessage(1, 1, html);
    assert.match(m.body, /Need samples & prices/); assert.ok(!/script|style|<p>/.test(m.body), 'HTML stripped');
  }
  {
    const m = await normalizeImapMessage(1, 1, Buffer.from('From: a@b.com\r\n\r\n'), new Date('2026-01-01T00:00:00Z'));
    assert.equal(m.body, '(no text content)', 'empty message never yields an empty body');
    assert.equal(m.receivedAt.toISOString(), '2026-01-01T00:00:00.000Z', 'falls back to the server internal date');
  }
  assert.equal((await normalizeImapMessage(1, 1, eml('', 'x'.repeat(50_000)))).body.length, 20_000, 'body capped');
  assert.equal(__imapInternals.htmlToText('<div>a</div><div>b</div>'), 'a\nb');

  // ── syncImapSession against a fake mailbox ──────────────────────────────────
  const make = (uidValidity: number, uids: number[]) => {
    const calls: string[] = [];
    const session: ImapSession = {
      uidValidity,
      async searchSince(since) { calls.push(`since:${since.toISOString().slice(0, 10)}`); return uids; },
      async searchAfterUid(uid) { calls.push(`after:${uid}`); return uids; },
      async *fetchSources(want) { for (const uid of want) yield { uid, source: Buffer.from(`Subject: m${uid}\r\nFrom: a@b.com\r\nMessage-ID: <m${uid}@x>\r\n\r\nbody ${uid}`), internalDate: null }; },
      async close() {},
    };
    return { session, calls };
  };
  const now = new Date('2026-10-05T12:00:00Z');

  { // first run: seeds from the recent window
    const { session, calls } = make(7, [3, 1, 2]);
    const r = await syncImapSession(session, null, now);
    assert.deepEqual(calls, ['since:2026-09-28']);
    assert.deepEqual(r.messages.map((m) => m.subject), ['m1', 'm2', 'm3'], 'processed oldest-first');
    assert.equal(r.cursor, '7:3');
  }
  { // incremental: strictly newer than the cursor — `uid:*` echoing the last message must not re-import it
    const { session, calls } = make(7, [3]);
    const r = await syncImapSession(session, '7:3', now);
    assert.deepEqual(calls, ['after:3']);
    assert.equal(r.messages.length, 0, 'the echoed newest message is filtered out');
    assert.equal(r.cursor, '7:3', 'cursor unchanged when nothing is new');
  }
  { // incremental with new mail
    const { session } = make(7, [3, 4, 5]);
    const r = await syncImapSession(session, '7:3', now);
    assert.deepEqual(r.messages.map((m) => m.subject), ['m4', 'm5']); assert.equal(r.cursor, '7:5');
  }
  { // UIDVALIDITY changed → cursor is meaningless → re-seed from the window
    const { session, calls } = make(8, [1, 2]);
    const r = await syncImapSession(session, '7:500', now);
    assert.deepEqual(calls, ['since:2026-09-28']); assert.equal(r.messages.length, 2); assert.equal(r.cursor, '8:2');
  }
  { // batch cap: take the OLDEST N so the cursor advances monotonically and the rest is picked up next sync
    const uids = Array.from({ length: MAX_MESSAGES_PER_SYNC + 25 }, (_, i) => i + 1);
    const { session } = make(7, uids);
    const r = await syncImapSession(session, '7:0', now);
    assert.equal(r.messages.length, MAX_MESSAGES_PER_SYNC); assert.equal(r.cursor, `7:${MAX_MESSAGES_PER_SYNC}`);
    assert.equal(r.messages[0].subject, 'm1');
  }
  { // empty mailbox on first run
    const { session } = make(7, []);
    assert.deepEqual(await syncImapSession(session, null, now), { messages: [], cursor: '7:0' });
  }
  { // duplicate UIDs from the server are collapsed
    const { session } = make(7, [2, 2, 3, 3]);
    assert.equal((await syncImapSession(session, '7:1', now)).messages.length, 2);
  }

  // ── Registry wiring ─────────────────────────────────────────────────────────
  assert.equal(getInboxProvider('imap').canPull, true, 'imap is a live provider, not a stub');
  assert.equal(getInboxProvider('imap').kind, 'imap');

  console.log('✓ imap: SSRF guard, credential/cursor parsing, MIME normalisation, sync cursor + batch limits');
})().catch((e) => { console.error(e); process.exit(1); });
