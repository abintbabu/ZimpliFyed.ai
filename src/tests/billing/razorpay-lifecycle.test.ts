import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

/**
 * Razorpay billing lifecycle e2e (ROADMAP §7 item 6), mirroring lifecycle.test.ts conventions: pure, no DB,
 * no network — run with `npm run test:billing:razorpay`.
 *
 * Exercises the real webhook route (signature verification → WebhookEvent replay-safety row → reducer) and
 * the real reducer against an in-memory fake Prisma, injected through the `globalThis.prisma` singleton hook
 * in src/lib/prisma.ts *before* any billing module is imported. Covers, per BILLING_SPEC §2/§3:
 *   subscription.activated → active + plan + entitlement fields set (billing.subscribed)
 *   subscription.charged (routine) → renewal, currentPeriodEnd rolls forward (billing.renewed)
 *   subscription.halted → past_due + pastDueSince (billing.payment_failed → dunning path)
 *   subscription.charged (from past_due) → recovery (billing.payment_recovered)
 *   subscription.cancelled → plan free, provider sub cleared (billing.cancelled)
 *   duplicate x-razorpay-event-id → deduped, reducer never runs (idempotency)
 *   bad signature → 400, no state change
 *   unresolvable tenant → no-op ack
 * Plus the tenant-routing rule (DECISIONS 2026-07-12): India-pack tenants → Razorpay, others → Stripe,
 * linked provider always wins.
 */

// ── Env must be set before the billing modules load (plan-id maps are captured at import) ──
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.RAZORPAY_PLAN_STARTER = 'plan_rzp_starter';
process.env.RAZORPAY_PLAN_GROWTH = 'plan_rzp_growth';
process.env.RAZORPAY_PLAN_ENTERPRISE = 'plan_rzp_ent';

// ── In-memory fake Prisma, injected via the lib/prisma global singleton ──
type FakeTenant = {
  id: string;
  name: string;
  packId: string | null;
  plan: string;
  status: string;
  billingProvider: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  pastDueSince: Date | null;
  gstin?: string | null;
};

const tenants = new Map<string, FakeTenant>();
const domainEvents: { tenantId: string; type: string; refId?: string; payload?: unknown }[] = [];
const webhookEventKeys = new Set<string>();

function pick(row: Record<string, unknown>, select?: Record<string, boolean>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = row[k];
  return out;
}

const fakePrisma = {
  tenant: {
    async findUnique({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) {
      const t = tenants.get(where.id);
      return t ? pick(t as unknown as Record<string, unknown>, select) : null;
    },
    async findUniqueOrThrow(args: { where: { id: string }; select?: Record<string, boolean> }) {
      const t = await fakePrisma.tenant.findUnique(args);
      if (!t) throw new Error(`Tenant not found: ${args.where.id}`);
      return t;
    },
    async findFirst({ where, select }: { where: Partial<FakeTenant>; select?: Record<string, boolean> }) {
      for (const t of tenants.values()) {
        if (Object.entries(where).every(([k, v]) => (t as unknown as Record<string, unknown>)[k] === v)) {
          return pick(t as unknown as Record<string, unknown>, select);
        }
      }
      return null;
    },
    async update({ where, data }: { where: { id: string }; data: Partial<FakeTenant> }) {
      const t = tenants.get(where.id);
      if (!t) throw new Error(`Tenant not found: ${where.id}`);
      Object.assign(t, data);
      return { ...t };
    },
  },
  domainEvent: {
    async create({ data }: { data: { tenantId: string; type: string; refId?: string; payload?: unknown } }) {
      domainEvents.push(data);
      return data;
    },
  },
  webhookEvent: {
    async create({ data }: { data: { provider: string; eventId: string } }) {
      const key = `${data.provider}:${data.eventId}`;
      if (webhookEventKeys.has(key)) {
        const err = new Error('Unique constraint failed on (provider, eventId)') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      }
      webhookEventKeys.add(key);
      return data;
    },
  },
};

// Install the fake before src/lib/prisma.ts loads: it reads globalThis.prisma first (non-production).
(globalThis as unknown as { prisma: unknown }).prisma = fakePrisma;

function seedTenant(overrides: Partial<FakeTenant> & { id: string }): FakeTenant {
  const t: FakeTenant = {
    name: 'Test Exports Pvt Ltd',
    packId: 'in',
    plan: 'free',
    status: 'trial',
    billingProvider: null,
    providerCustomerId: null,
    providerSubscriptionId: null,
    currentPeriodEnd: null,
    pastDueSince: null,
    ...overrides,
  };
  tenants.set(t.id, t);
  return t;
}

const sign = (body: string) =>
  createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');

async function main() {
  const { POST } = await import('../../app/api/billing/razorpay/route');

  const T = 'tenant_in_1';
  const SUB = 'sub_rzp_001';
  seedTenant({ id: T, providerSubscriptionId: SUB, billingProvider: 'razorpay' });

  let eventSeq = 0;
  async function deliver(
    event: string,
    sub: Record<string, unknown>,
    opts: { eventId?: string | null; badSignature?: boolean } = {},
  ) {
    const body = JSON.stringify({ event, payload: { subscription: { entity: sub } } });
    const headers = new Headers();
    headers.set('x-razorpay-signature', opts.badSignature ? 'deadbeef' : sign(body));
    const eventId = opts.eventId === undefined ? `evt_${++eventSeq}` : opts.eventId;
    if (eventId) headers.set('x-razorpay-event-id', eventId);
    const res = await POST(new Request('http://localhost/api/billing/razorpay', { method: 'POST', headers, body }));
    return { status: res.status, json: await res.json(), eventId };
  }

  const tenant = () => tenants.get(T)!;
  const lastEvent = () => domainEvents[domainEvents.length - 1];

  // 1. Bad signature → 400, no state change, no dedupe row consumed.
  {
    const before = { ...tenant() };
    const res = await deliver('subscription.activated', { id: SUB, status: 'active' }, { badSignature: true });
    assert.equal(res.status, 400, 'bad signature rejected');
    assert.deepEqual(tenant(), before, 'bad signature leaves tenant untouched');
    assert.equal(domainEvents.length, 0);
  }

  // 2. subscription.activated → active, plan from plan_id, currentPeriodEnd set, billing.subscribed.
  const periodEnd1 = Math.floor(new Date('2026-10-01T00:00:00Z').getTime() / 1000);
  const activated = await deliver('subscription.activated', {
    id: SUB,
    status: 'active',
    plan_id: 'plan_rzp_growth',
    current_end: periodEnd1,
    notes: { tenantId: T, plan: 'growth' },
  });
  assert.equal(activated.status, 200);
  assert.equal(tenant().status, 'active', 'activated → status active');
  assert.equal(tenant().plan, 'growth', 'entitlement plan mapped from Razorpay plan_id');
  assert.equal(tenant().billingProvider, 'razorpay');
  assert.equal(tenant().providerSubscriptionId, SUB);
  assert.equal(tenant().currentPeriodEnd?.getTime(), periodEnd1 * 1000);
  assert.equal(tenant().pastDueSince, null);
  assert.deepEqual(lastEvent(), { tenantId: T, type: 'billing.subscribed', refId: SUB, payload: { plan: 'growth' } });

  // 3. Replay of the same delivery (same x-razorpay-event-id) → deduped no-op.
  {
    const eventsBefore = domainEvents.length;
    const before = { ...tenant() };
    const replay = await deliver(
      'subscription.activated',
      { id: SUB, status: 'active', plan_id: 'plan_rzp_growth', current_end: periodEnd1, notes: { tenantId: T } },
      { eventId: activated.eventId },
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.json.deduped, true, 'duplicate event id short-circuits');
    assert.equal(domainEvents.length, eventsBefore, 'replay writes no domain event');
    assert.deepEqual(tenant(), before, 'replay changes no tenant state');
  }

  // 4. Routine renewal: subscription.charged while already active → billing.renewed, period rolls forward.
  const periodEnd2 = periodEnd1 + 30 * 24 * 3600;
  await deliver('subscription.charged', {
    id: SUB,
    status: 'active',
    plan_id: 'plan_rzp_growth',
    current_end: periodEnd2,
    notes: { tenantId: T },
  });
  assert.equal(tenant().status, 'active');
  assert.equal(tenant().currentPeriodEnd?.getTime(), periodEnd2 * 1000);
  assert.equal(lastEvent().type, 'billing.renewed', 'charge on active tenant is a renewal, not a recovery');

  // 5. Payment failure: subscription.halted → past_due + pastDueSince (dunning entry point).
  await deliver('subscription.halted', { id: SUB, notes: { tenantId: T } });
  assert.equal(tenant().status, 'past_due', 'halted → past_due');
  assert.ok(tenant().pastDueSince instanceof Date, 'pastDueSince stamped for dunning sweep');
  assert.equal(lastEvent().type, 'billing.payment_failed');
  assert.equal(tenant().plan, 'growth', 'entitlements retained during dunning per BILLING_SPEC (suspension is the sweep’s job)');

  // 6. Recovery: subscription.charged from past_due → active again, billing.payment_recovered.
  await deliver('subscription.charged', {
    id: SUB,
    status: 'active',
    plan_id: 'plan_rzp_growth',
    current_end: periodEnd2,
    notes: { tenantId: T },
  });
  assert.equal(tenant().status, 'active');
  assert.equal(tenant().pastDueSince, null, 'dunning marker cleared on recovery');
  assert.equal(lastEvent().type, 'billing.payment_recovered');

  // 7. Cancellation → free plan, provider sub cleared, still an active (free) tenant.
  await deliver('subscription.cancelled', { id: SUB, notes: { tenantId: T } });
  assert.equal(tenant().plan, 'free', 'cancelled → downgraded to free');
  assert.equal(tenant().status, 'active');
  assert.equal(tenant().providerSubscriptionId, null);
  assert.equal(tenant().currentPeriodEnd, null);
  assert.equal(lastEvent().type, 'billing.cancelled');

  // 8. Tenant resolution fallback: no notes.tenantId → resolved via stored providerSubscriptionId.
  {
    const T2 = 'tenant_in_2';
    seedTenant({ id: T2, billingProvider: 'razorpay', providerSubscriptionId: 'sub_rzp_002', status: 'trial' });
    await deliver('subscription.activated', { id: 'sub_rzp_002', plan_id: 'plan_rzp_starter', current_end: periodEnd1 });
    assert.equal(tenants.get(T2)!.status, 'active', 'tenant resolved from providerSubscriptionId fallback');
    assert.equal(tenants.get(T2)!.plan, 'starter');
  }

  // 9. Unresolvable tenant → acked no-op (unrelated Razorpay activity can't fail the webhook).
  {
    const eventsBefore = domainEvents.length;
    const res = await deliver('subscription.activated', { id: 'sub_unknown', plan_id: 'plan_rzp_starter' });
    assert.equal(res.status, 200);
    assert.equal(domainEvents.length, eventsBefore, 'unknown subscription is a no-op');
  }

  // 10. Tenant routing (DECISIONS 2026-07-12): India-pack → Razorpay; non-India → Stripe; linked provider wins.
  {
    const { getBillingProviderForTenant } = await import('../../lib/billing/provider');
    const { razorpayAdapter } = await import('../../lib/billing/razorpay-adapter');
    const { stripeAdapter } = await import('../../lib/billing/stripe-adapter');

    seedTenant({ id: 'tenant_route_in', packId: 'in' });
    seedTenant({ id: 'tenant_route_us', packId: 'us' });
    seedTenant({ id: 'tenant_route_linked_stripe', packId: 'in', billingProvider: 'stripe' });

    assert.equal(await getBillingProviderForTenant('tenant_route_in'), razorpayAdapter, 'India-pack tenant routes to Razorpay');
    assert.equal(await getBillingProviderForTenant('tenant_route_us'), stripeAdapter, 'non-India tenant routes to Stripe');
    assert.equal(
      await getBillingProviderForTenant('tenant_route_linked_stripe'),
      stripeAdapter,
      'already-linked provider wins over pack routing (never strand an active subscription)',
    );
  }

  console.log(
    '✓ razorpay billing lifecycle: activated → renewed → halted (dunning) → recovered → cancelled, ' +
      'webhook idempotency (dedupe replay), signature rejection, tenant fallback resolution, and INR/Stripe routing all pass',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
