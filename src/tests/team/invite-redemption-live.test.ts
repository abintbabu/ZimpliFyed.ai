import assert from 'node:assert/strict';

/**
 * Invite redemption end-to-end through the real resolver: `npm run test:invite:live`.
 *
 * This is the one team flow where a mistake hands a stranger a seat, so it's tested against the
 * actual `resolvePostAuthDestination()` and a real database rather than a mocked unit. The pure
 * rules (canRedeemInvite, isInviteUsable) are covered offline in team-guards.test.ts; this proves
 * the resolver applies them, in the right order, and writes the right rows.
 *
 * The case that motivated it: email invites gained tokens so they could be mailed as a /join link.
 * A token is a bearer credential, so without binding, a forwarded invite meant for the CFO would
 * have been redeemable by whoever the mail reached.
 *
 * Run: point DATABASE_URL at a throwaway local Postgres with the schema loaded. Refuses anything
 * that isn't loopback, so it can never touch the shared Supabase instance.
 */

async function main() {
// ── Safety guard: local loopback DBs only ─────────────────────────────────────
const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(127\.0\.0\.1|localhost|::1)[:/]/.test(url) || url.includes('@localhost');
if (!url) {
  console.log('⊘ invite-redemption-live: DATABASE_URL not set — skipping (needs a local test Postgres)');
  process.exit(0);
}
if (!isLocal) {
  console.error(`✗ invite-redemption-live: refusing to run against non-local DB (${url.replace(/:[^:@/]+@/, ':****@')}).`);
  process.exit(1);
}

const { prisma } = await import('../../lib/prisma');
const { resolvePostAuthDestination } = await import('../../lib/post-auth');

const suffix = Date.now().toString(36);
const slugA = `inv-a-${suffix}`;
const slugB = `inv-b-${suffix}`;
let tenantAId = '';
let tenantBId = '';
const userIds: string[] = [];

async function mkUser(email: string | null) {
  const u = await prisma.user.create({ data: { email, name: email?.split('@')[0] ?? 'No Email' } });
  userIds.push(u.id);
  return u;
}

const membershipOf = (userId: string, tenantId: string) =>
  prisma.membership.findUnique({ where: { userId_tenantId: { userId, tenantId } }, select: { role: true } });

async function cleanup() {
  for (const id of [tenantAId, tenantBId].filter(Boolean)) {
    await prisma.invite.deleteMany({ where: { tenantId: id } });
    await prisma.membership.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

try {
  const tenantA = await prisma.tenant.create({ data: { slug: slugA, name: 'Invite Tenant A', plan: 'growth', status: 'active' } });
  const tenantB = await prisma.tenant.create({ data: { slug: slugB, name: 'Invite Tenant B', plan: 'growth', status: 'active' } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;
  const inviter = await mkUser(`inviter-${suffix}@tenant-a.test`);
  await prisma.membership.create({ data: { userId: inviter.id, tenantId: tenantAId, role: 'owner' } });

  const mkInvite = (data: Partial<{ email: string | null; role: 'sales' | 'viewer' | 'finance'; token: string | null; expiresAt: Date | null; maxUses: number | null; useCount: number }>) =>
    prisma.invite.create({
      data: {
        tenantId: tenantAId,
        email: data.email ?? null,
        role: data.role ?? 'viewer',
        token: data.token ?? null,
        expiresAt: data.expiresAt ?? new Date(Date.now() + 14 * 86_400_000),
        maxUses: data.maxUses ?? null,
        useCount: data.useCount ?? 0,
        invitedByUserId: inviter.id,
      },
    });

  // ── 1. Targeted invite, redeemed by the right person via its token ─────────
  {
    const email = `right-${suffix}@example.test`;
    await mkInvite({ email, role: 'sales', token: `tok-right-${suffix}` });
    const user = await mkUser(email);

    const dest = await resolvePostAuthDestination({ id: user.id, email }, `tok-right-${suffix}`);
    assert.deepEqual(dest, { kind: 'dashboard', tenantSlug: slugA }, 'lands in the inviting workspace');
    assert.equal((await membershipOf(user.id, tenantAId))?.role, 'sales', 'role from the invite is granted');
  }

  // ── 2. Targeted invite, token used by someone else → NOT granted ──────────
  // The forwarded-link case. The resolver must fall through rather than seat the wrong account.
  {
    const invited = `cfo-${suffix}@example.test`;
    await mkInvite({ email: invited, role: 'finance', token: `tok-cfo-${suffix}` });
    const intruder = await mkUser(`intern-${suffix}@example.test`);

    const dest = await resolvePostAuthDestination({ id: intruder.id, email: intruder.email }, `tok-cfo-${suffix}`);
    assert.equal(await membershipOf(intruder.id, tenantAId), null, 'intruder must NOT get a membership');
    assert.equal(dest.kind, 'create', 'with no other membership, they fall through to the create wizard');

    // And the invite must still be live for its intended recipient.
    const still = await prisma.invite.findFirst({ where: { tenantId: tenantAId, email: invited } });
    assert.equal(still?.acceptedAt, null, 'the invite is not consumed by the failed attempt');
    assert.equal(still?.useCount, 0, 'and its use count is untouched');

    const cfo = await mkUser(invited);
    const ok = await resolvePostAuthDestination({ id: cfo.id, email: invited }, `tok-cfo-${suffix}`);
    assert.deepEqual(ok, { kind: 'dashboard', tenantSlug: slugA }, 'the real recipient can still redeem it');
    assert.equal((await membershipOf(cfo.id, tenantAId))?.role, 'finance');
  }

  // ── 3. Case-insensitive email match ───────────────────────────────────────
  {
    const stored = `mixed-${suffix}@example.test`;
    await mkInvite({ email: stored, role: 'viewer', token: `tok-mixed-${suffix}` });
    const user = await mkUser(`MIXED-${suffix}@Example.TEST`);
    const dest = await resolvePostAuthDestination({ id: user.id, email: `MIXED-${suffix}@Example.TEST` }, `tok-mixed-${suffix}`);
    assert.deepEqual(dest, { kind: 'dashboard', tenantSlug: slugA }, 'casing must not block a legitimate redemption');
  }

  // ── 4. Expired token → refused ────────────────────────────────────────────
  {
    await mkInvite({ email: null, token: `tok-expired-${suffix}`, expiresAt: new Date(Date.now() - 86_400_000) });
    const user = await mkUser(`exp-${suffix}@example.test`);
    const dest = await resolvePostAuthDestination({ id: user.id, email: user.email }, `tok-expired-${suffix}`);
    assert.equal(await membershipOf(user.id, tenantAId), null, 'an expired invite grants nothing');
    assert.equal(dest.kind, 'create');
  }

  // ── 5. Exhausted link invite → refused ────────────────────────────────────
  {
    await mkInvite({ email: null, token: `tok-spent-${suffix}`, maxUses: 2, useCount: 2 });
    const user = await mkUser(`spent-${suffix}@example.test`);
    const dest = await resolvePostAuthDestination({ id: user.id, email: user.email }, `tok-spent-${suffix}`);
    assert.equal(await membershipOf(user.id, tenantAId), null, 'a used-up link grants nothing');
    assert.equal(dest.kind, 'create');
  }

  // ── 6. Open link invite: anyone may redeem, and useCount increments ───────
  {
    await mkInvite({ email: null, role: 'viewer', token: `tok-open-${suffix}`, maxUses: 3 });
    const one = await mkUser(`open1-${suffix}@example.test`);
    const two = await mkUser(`open2-${suffix}@example.test`);

    await resolvePostAuthDestination({ id: one.id, email: one.email }, `tok-open-${suffix}`);
    await resolvePostAuthDestination({ id: two.id, email: two.email }, `tok-open-${suffix}`);

    assert.equal((await membershipOf(one.id, tenantAId))?.role, 'viewer');
    assert.equal((await membershipOf(two.id, tenantAId))?.role, 'viewer');
    const inv = await prisma.invite.findFirst({ where: { tenantId: tenantAId, token: `tok-open-${suffix}` } });
    assert.equal(inv?.useCount, 2, 'each redemption is counted, so maxUses can actually bite');
  }

  // ── 7. Unknown token → refused, no membership anywhere ────────────────────
  {
    const user = await mkUser(`unknown-${suffix}@example.test`);
    const dest = await resolvePostAuthDestination({ id: user.id, email: user.email }, `tok-does-not-exist-${suffix}`);
    assert.equal(dest.kind, 'create');
    assert.equal(await prisma.membership.count({ where: { userId: user.id } }), 0);
  }

  // ── 8. Pending email invites are consumed without a token (step 1) ────────
  // The email path predates tokens: signing in with an invited address still seats you.
  {
    const email = `nopath-${suffix}@example.test`;
    await mkInvite({ email, role: 'sales', token: null });
    const user = await mkUser(email);
    const dest = await resolvePostAuthDestination({ id: user.id, email });
    assert.deepEqual(dest, { kind: 'dashboard', tenantSlug: slugA });
    assert.equal((await membershipOf(user.id, tenantAId))?.role, 'sales');
    const consumed = await prisma.invite.findFirst({ where: { tenantId: tenantAId, email } });
    assert.ok(consumed?.acceptedAt, 'the invite is stamped accepted');
  }

  // ── 9. Invites from two tenants for one address → both granted ────────────
  // Someone can legitimately belong to several workspaces (a consultant, a CA firm).
  {
    const email = `multi-${suffix}@example.test`;
    const inviterB = await mkUser(`inviter-b-${suffix}@tenant-b.test`);
    await prisma.membership.create({ data: { userId: inviterB.id, tenantId: tenantBId, role: 'owner' } });
    await mkInvite({ email, role: 'sales' });
    await prisma.invite.create({
      data: { tenantId: tenantBId, email, role: 'viewer', invitedByUserId: inviterB.id, expiresAt: new Date(Date.now() + 14 * 86_400_000) },
    });

    const user = await mkUser(email);
    const dest = await resolvePostAuthDestination({ id: user.id, email });
    assert.equal(dest.kind, 'dashboard');
    assert.equal((await membershipOf(user.id, tenantAId))?.role, 'sales', 'tenant A seat granted');
    assert.equal((await membershipOf(user.id, tenantBId))?.role, 'viewer', 'tenant B seat granted');
  }

  // ── 10. Redeeming twice must not duplicate or downgrade the membership ────
  {
    const email = `twice-${suffix}@example.test`;
    await mkInvite({ email, role: 'finance', token: `tok-twice-${suffix}` });
    const user = await mkUser(email);

    await resolvePostAuthDestination({ id: user.id, email }, `tok-twice-${suffix}`);
    // Promote them, then replay the invite: the upsert must not reset the role to the invited one.
    await prisma.membership.update({
      where: { userId_tenantId: { userId: user.id, tenantId: tenantAId } },
      data: { role: 'admin' },
    });
    await resolvePostAuthDestination({ id: user.id, email }, `tok-twice-${suffix}`);

    assert.equal(await prisma.membership.count({ where: { userId: user.id, tenantId: tenantAId } }), 1, 'no duplicate membership');
    assert.equal((await membershipOf(user.id, tenantAId))?.role, 'admin', 'a replayed invite must not downgrade an existing role');
  }

  console.log('✓ invite-redemption-live: 10 scenarios — token binding, expiry, exhaustion, open links, multi-tenant seats, replay safety');
} finally {
  await cleanup();
  await prisma.$disconnect();
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
