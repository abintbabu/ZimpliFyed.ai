import assert from 'node:assert/strict';

/**
 * WhatsApp inbound webhook, at the route-handler level: `npm run test:whatsapp-route`.
 *
 * webhook-signature.test coverage (in gmail.test.ts) proves the HMAC function is correct. This
 * file proves the *route* actually uses it — that an unsigned or wrongly-signed POST is rejected
 * before any tenant row is touched, and that a valid one still ingests.
 *
 * That distinction matters: the verifier being right is worth nothing if the handler forgets to
 * call it, or calls it after parsing and routing. The route has no session — the signature is the
 * only authentication — so before it existed, anyone who learned a `phone_number_id` could inject
 * messages into that tenant's inbox and from there into its AI classification queue.
 *
 * No DB and no network: a fake Prisma client is injected on `globalThis` before the route module
 * loads (src/lib/prisma.ts honours an already-set `globalThis.prisma`), and the job queue is
 * stubbed, so every assertion is about control flow in the handler.
 */

type Row = Record<string, unknown>;

async function main() {
  const SECRET = 'route-test-secret';
  process.env.WHATSAPP_APP_SECRET = SECRET;
  // NODE_ENV is readonly in the Next type augmentation; assign through the record to exercise the
  // fail-closed production path rather than the dev bypass.
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

  // ── Fake Prisma, recording every call so we can assert nothing was touched on rejection ──
  const calls: string[] = [];
  const messages: Row[] = [];
  const jobs: Row[] = [];
  const CHANNEL = { id: 'chan-1', tenantId: 'tenant-A' };

  const fake = {
    inboxChannel: {
      findFirst: async (args: { where?: Row }) => {
        calls.push('inboxChannel.findFirst');
        const or = (args?.where?.OR ?? []) as { identifier?: string }[];
        const wanted = or.map((o) => o.identifier);
        return wanted.includes('phone-A') || wanted.includes('+911234567890') ? CHANNEL : null;
      },
    },
    // enqueue() writes the inbox.ingest job that classifies the message.
    job: {
      findUnique: async () => null,
      create: async (args: { data?: Row }) => {
        calls.push('job.create');
        const row = { id: `job-${jobs.length + 1}`, ...(args.data ?? {}) };
        jobs.push(row);
        return row;
      },
    },
    inboxMessage: {
      upsert: async (args: { where?: Row; create?: Row }) => {
        calls.push('inboxMessage.upsert');
        const row = { id: `msg-${messages.length + 1}`, category: null, ...(args.create ?? {}) };
        messages.push(row);
        return row;
      },
    },
  };
  (globalThis as unknown as { prisma?: unknown }).prisma = fake;

  const { signWhatsAppBody } = await import('../../lib/whatsapp/webhook-signature');
  const { POST, GET } = await import('../../app/api/inbox/whatsapp/route');

  const body = (phoneId: string | null, msgId = 'wamid.1', displayNumber: string | null = '+911234567890') =>
    JSON.stringify({
      entry: [{
        changes: [{
          value: {
            metadata: phoneId ? { phone_number_id: phoneId, display_phone_number: displayNumber ?? undefined } : {},
            contacts: [{ wa_id: '919876543210', profile: { name: 'Priya' } }],
            messages: [{ id: msgId, from: '919876543210', type: 'text', text: { body: 'Need 500 towels CIF Hamburg' } }],
          },
        }],
      }],
    });

  const post = (raw: string, sig: string | null) =>
    POST(new Request('https://acme.zimplifyed.ai/api/inbox/whatsapp', {
      method: 'POST',
      headers: sig ? { 'content-type': 'application/json', 'x-hub-signature-256': sig } : { 'content-type': 'application/json' },
      body: raw,
    }));

  // ── 1. No signature header → 401, and nothing read or written ──────────────
  {
    calls.length = 0;
    const res = await post(body('phone-A'), null);
    assert.equal(res.status, 401, 'unsigned POST must be rejected');
    assert.equal(calls.length, 0, 'rejection must happen before any tenant lookup');
  }

  // ── 2. Signature from the wrong secret → 401 ───────────────────────────────
  {
    calls.length = 0;
    const raw = body('phone-A');
    const res = await post(raw, signWhatsAppBody(raw, 'attacker-secret'));
    assert.equal(res.status, 401, 'signature from another secret must be rejected');
    assert.equal(calls.length, 0, 'no DB access on a bad signature');
  }

  // ── 3. Valid signature over a DIFFERENT body → 401 (the injection case) ────
  // An attacker replaying a captured signature with their own payload. This is exactly why the
  // handler must hash the raw bytes it received rather than re-serialising the parsed object.
  {
    calls.length = 0;
    const signed = body('phone-A', 'wamid.original');
    const tampered = body('phone-A', 'wamid.injected');
    const res = await post(tampered, signWhatsAppBody(signed, SECRET));
    assert.equal(res.status, 401, 'replayed signature over a different body must be rejected');
    assert.equal(calls.length, 0, 'no DB access on a tampered body');
    assert.equal(messages.length, 0, 'nothing ingested');
  }

  // ── 4. Malformed digest → 401, not a crash ────────────────────────────────
  // timingSafeEqual throws on a length mismatch, so a short or non-hex digest must be caught by a
  // length check first. A 500 here would be a trivial DoS and would also mask the rejection.
  {
    for (const bad of ['sha256=zz', 'sha256=', 'sha1=abcdef', 'garbage', 'sha256=' + 'ab'.repeat(16)]) {
      const raw = body('phone-A');
      const res = await post(raw, bad);
      assert.equal(res.status, 401, `malformed signature ${bad} must give 401, not an error`);
    }
  }

  // ── 5. Valid signature → ingested, and routed to the matched channel's tenant ──
  {
    calls.length = 0;
    messages.length = 0;
    const raw = body('phone-A');
    const res = await post(raw, signWhatsAppBody(raw, SECRET));
    assert.equal(res.status, 200, 'a correctly signed delivery is accepted');
    assert.ok(calls.includes('inboxChannel.findFirst'), 'channel resolved');
    assert.equal(messages.length, 1, 'message ingested');
    assert.equal(messages[0].tenantId, 'tenant-A', 'tenant comes from the matched channel, not the payload');
    assert.equal(messages[0].channelId, 'chan-1');
    assert.equal(messages[0].body, 'Need 500 towels CIF Hamburg');
    assert.equal(messages[0].fromAddress, '919876543210');
    assert.equal(messages[0].fromName, 'Priya', 'contact profile name is carried over');

    // An uncategorised message must be queued for classification, under the same tenant.
    assert.equal(jobs.length, 1, 'inbox.ingest job enqueued');
    assert.equal(jobs[0].kind, 'inbox.ingest');
    assert.equal(jobs[0].tenantId, 'tenant-A', 'the job inherits the channel’s tenant');
  }

  // ── 6. Signed, but no channel claims that number → accepted and ignored ────
  // Meta retries on a non-2xx, so an unmatched number must not 500 or we'd be retried forever for
  // a number nobody owns. It must also not create a row.
  {
    calls.length = 0;
    messages.length = 0;
    jobs.length = 0;
    const raw = body('phone-UNKNOWN', 'wamid.unknown', '+910000000000');
    const res = await post(raw, signWhatsAppBody(raw, SECRET));
    assert.equal(res.status, 200, 'unmatched number is acknowledged, not retried');
    assert.equal(messages.length, 0, 'no message stored for an unclaimed number');
    assert.equal(jobs.length, 0, 'and nothing queued for AI classification');
  }

  // ── 6b. Display-number fallback: unknown phone_number_id, known display number ──
  // The route matches on phone_number_id first (stable) and falls back to the human-readable
  // number, since either may be what the tenant stored as the channel identifier.
  {
    messages.length = 0;
    const raw = body('phone-NOT-STORED', 'wamid.fallback', '+911234567890');
    const res = await post(raw, signWhatsAppBody(raw, SECRET));
    assert.equal(res.status, 200);
    assert.equal(messages.length, 1, 'resolved via display_phone_number');
    assert.equal(messages[0].tenantId, 'tenant-A');
  }

  // ── 7. Signed but invalid JSON → 400, after the signature check ───────────
  {
    const raw = '{not json';
    const res = await post(raw, signWhatsAppBody(raw, SECRET));
    assert.equal(res.status, 400, 'malformed JSON is a 400');
  }

  // ── 8. Empty body, correctly signed → 200, no rows ────────────────────────
  // Meta sends status-only callbacks with no `messages` array.
  {
    messages.length = 0;
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-A' } } }] }] });
    const res = await post(raw, signWhatsAppBody(raw, SECRET));
    assert.equal(res.status, 200);
    assert.equal(messages.length, 0, 'a status-only callback stores nothing');
  }

  // ── 9. GET handshake honours the verify token ─────────────────────────────
  {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    const ok = await GET(new Request('https://x/api/inbox/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'));
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '12345', 'challenge is echoed verbatim');

    const bad = await GET(new Request('https://x/api/inbox/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345'));
    assert.equal(bad.status, 403, 'wrong verify token is refused');

    const noMode = await GET(new Request('https://x/api/inbox/whatsapp?hub.verify_token=verify-me&hub.challenge=12345'));
    assert.equal(noMode.status, 403, 'missing hub.mode is refused');
  }

  console.log('✓ whatsapp-route: 10 scenarios — signature enforced before any DB access, tamper/replay refused, valid delivery ingests to the matched tenant');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
