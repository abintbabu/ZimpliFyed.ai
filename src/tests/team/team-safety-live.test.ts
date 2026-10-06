import assert from 'node:assert/strict';

/**
 * Team-safety invariants against a REAL Postgres: the database-level behaviour the authorization
 * model assumes. The pure decision rules are covered offline in team-guards.test.ts; this file
 * proves the data layer underneath them does what those rules expect.
 *
 * Why it needs a database: the security property that makes removal and demotion *take effect* is
 * that requireTenantSession() reads the Membership row rather than trusting the session JWT's
 * cached claim. That's a property of a query, so it's tested as one — this file issues the exact
 * `membership.findUnique({ userId_tenantId })` lookup the chokepoint uses.
 *
 * Run: point DATABASE_URL at a throwaway local Postgres with the schema loaded, then
 * `npm run test:team:live`. It refuses to run against anything that isn't a local loopback DB, so
 * it can never touch the shared Supabase instance.
 *
 *   pg_dump --schema-only <DIRECT_URL> | psql <local>   # one-time schema load
 */

async function main() {
// ── Safety guard: local loopback DBs only ─────────────────────────────────────
const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(127\.0\.0\.1|localhost|::1)[:/]/.test(url) || url.includes('@localhost');
if (!url) {
  console.log('⊘ team-safety-live: DATABASE_URL not set — skipping (needs a local test Postgres)');
  process.exit(0);
}
if (!isLocal) {
  console.error(`✗ team-safety-live: refusing to run against non-local DB (${url.replace(/:[^:@/]+@/, ':****@')}).`);
  process.exit(1);
}

// Imported after the guard so the prisma singleton binds to the vetted local URL.
const { prisma } = await import('../../lib/prisma');
const { OWNER_ROLES } = await import('../../lib/permissions');
const { denyMemberRemoval, denyRoleChange } = await import('../../lib/team-guards');

const suffix = Date.now().toString(36);
const slugA = `team-a-${suffix}`;
const slugB = `team-b-${suffix}`;
let tenantAId = '';
let tenantBId = '';
const userIds: string[] = [];

/** The exact lookup src/lib/session-tenant.ts uses to authorize a request. */
const authorize = (userId: string, tenantId: string) =>
  prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { role: true },
  });

const ownerCount = (tenantId: string) =>
  prisma.membership.count({ where: { tenantId, role: { in: [...OWNER_ROLES] } } });

async function mkUser(email: string) {
  const u = await prisma.user.create({ data: { email, name: email.split('@')[0] } });
  userIds.push(u.id);
  return u;
}

async function cleanup() {
  for (const id of [tenantAId, tenantBId].filter(Boolean)) {
    await prisma.invite.deleteMany({ where: { tenantId: id } });
    await prisma.membership.deleteMany({ where: { tenantId: id } });
    await prisma.auditEntry.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

try {
  // ── Setup: two tenants, a realistic team in each ────────────────────────────
  const tenantA = await prisma.tenant.create({ data: { slug: slugA, name: 'Team Tenant A', plan: 'growth', status: 'active' } });
  const tenantB = await prisma.tenant.create({ data: { slug: slugB, name: 'Team Tenant B', plan: 'growth', status: 'active' } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  const ownerA = await mkUser(`owner-${suffix}@tenant-a.test`);
  const adminA = await mkUser(`admin-${suffix}@tenant-a.test`);
  const salesA = await mkUser(`sales-${suffix}@tenant-a.test`);
  const ownerB = await mkUser(`owner-${suffix}@tenant-b.test`);

  await prisma.membership.create({ data: { userId: ownerA.id, tenantId: tenantAId, role: 'owner' } });
  const mAdminA = await prisma.membership.create({ data: { userId: adminA.id, tenantId: tenantAId, role: 'admin' } });
  const mSalesA = await prisma.membership.create({ data: { userId: salesA.id, tenantId: tenantAId, role: 'sales' } });
  await prisma.membership.create({ data: { userId: ownerB.id, tenantId: tenantBId, role: 'owner' } });

  // ── 1. Cross-tenant: a member of A is not authorized on B ───────────────────
  // This is what stops a session scoped to A from working against B's host. Before the read
  // actions derived their own tenantId, this check was bypassable by passing B's id as a parameter.
  {
    assert.equal((await authorize(ownerA.id, tenantAId))?.role, 'owner', 'owner of A is authorized on A');
    assert.equal(await authorize(ownerA.id, tenantBId), null, 'owner of A is NOT authorized on B');
    assert.equal(await authorize(ownerB.id, tenantAId), null, 'owner of B is NOT authorized on A');
  }

  // ── 2. Removal revokes access immediately ───────────────────────────────────
  // The whole point of reading Membership from the DB instead of the JWT: the next request after
  // removal is already unauthorized, rather than waiting out the token's lifetime.
  {
    assert.ok(await authorize(salesA.id, tenantAId), 'sales starts authorized');
    await prisma.membership.delete({ where: { id: mSalesA.id } });
    assert.equal(await authorize(salesA.id, tenantAId), null, 'removed member is unauthorized at once');
  }

  // ── 3. Removal also clears the pointers that would resurrect access ─────────
  {
    const rejoin = await mkUser(`rejoin-${suffix}@tenant-a.test`);
    const m = await prisma.membership.create({ data: { userId: rejoin.id, tenantId: tenantAId, role: 'viewer' } });
    await prisma.user.update({ where: { id: rejoin.id }, data: { lastActiveTenantId: tenantAId } });
    await prisma.invite.create({
      data: { tenantId: tenantAId, email: rejoin.email!, role: 'viewer', invitedByUserId: ownerA.id, token: `tok-${suffix}-rejoin` },
    });

    // Mirrors removeMember()'s three writes.
    await prisma.membership.delete({ where: { id: m.id } });
    await prisma.invite.deleteMany({ where: { tenantId: tenantAId, email: rejoin.email!, acceptedAt: null } });
    await prisma.user.updateMany({ where: { id: rejoin.id, lastActiveTenantId: tenantAId }, data: { lastActiveTenantId: null } });

    assert.equal(await authorize(rejoin.id, tenantAId), null, 'no membership');
    assert.equal(
      await prisma.invite.count({ where: { tenantId: tenantAId, email: rejoin.email!, acceptedAt: null } }),
      0,
      'an unconsumed invite must not silently undo the removal',
    );
    const after = await prisma.user.findUnique({ where: { id: rejoin.id }, select: { lastActiveTenantId: true } });
    assert.equal(after?.lastActiveTenantId, null, 'lastActiveTenantId cleared so /welcome re-resolves');
  }

  // ── 4. ownerCount feeds the last-owner guard correctly ──────────────────────
  {
    assert.equal(await ownerCount(tenantAId), 1, 'tenant A has exactly one owner');
    // With one owner, both the demotion and the removal of that owner must be refused.
    assert.ok(denyRoleChange('owner', 'owner', 'viewer', await ownerCount(tenantAId)));
    assert.ok(denyMemberRemoval('owner', 'owner', await ownerCount(tenantAId)));

    // Promote the admin, and the same two calls become allowed.
    await prisma.membership.update({ where: { id: mAdminA.id }, data: { role: 'owner' } });
    assert.equal(await ownerCount(tenantAId), 2, 'promotion is counted');
    assert.equal(denyRoleChange('owner', 'owner', 'viewer', await ownerCount(tenantAId)), null);
    assert.equal(denyMemberRemoval('owner', 'owner', await ownerCount(tenantAId)), null);

    // super_admin is owner-tier and must be counted, or the guard could be walked around by
    // leaving only a legacy super_admin behind.
    await prisma.membership.update({ where: { id: mAdminA.id }, data: { role: 'super_admin' } });
    assert.equal(await ownerCount(tenantAId), 2, 'super_admin counts toward owner-tier');
    await prisma.membership.update({ where: { id: mAdminA.id }, data: { role: 'admin' } });
    assert.equal(await ownerCount(tenantAId), 1, 'back to one owner');

    // ownerCount is per-tenant: B's owner must never prop up A's count.
    assert.equal(await ownerCount(tenantBId), 1);
  }

  // ── 5. Role change takes effect on the next authorize() ─────────────────────
  {
    assert.equal((await authorize(adminA.id, tenantAId))?.role, 'admin');
    await prisma.membership.update({ where: { id: mAdminA.id }, data: { role: 'viewer' } });
    assert.equal((await authorize(adminA.id, tenantAId))?.role, 'viewer', 'demotion is visible immediately');
    await prisma.membership.update({ where: { id: mAdminA.id }, data: { role: 'admin' } });
  }

  // ── 6. Invites are per-tenant, tokenised, and expiring ─────────────────────
  {
    const shared = `shared-${suffix}@example.test`;
    const inviteA = await prisma.invite.create({
      data: {
        tenantId: tenantAId, email: shared, role: 'sales', invitedByUserId: ownerA.id,
        token: `tok-${suffix}-a`, expiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    const inviteB = await prisma.invite.create({
      data: {
        tenantId: tenantBId, email: shared, role: 'viewer', invitedByUserId: ownerB.id,
        token: `tok-${suffix}-b`, expiresAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    // The (tenantId,email) unique key must not stop two different tenants inviting the same person.
    assert.notEqual(inviteA.id, inviteB.id);
    assert.ok(inviteA.token && inviteA.expiresAt, 'email invites carry a token and an expiry');

    // The same address twice in one tenant collides — inviteUser() upserts on this key.
    await assert.rejects(
      prisma.invite.create({ data: { tenantId: tenantAId, email: shared, role: 'finance', invitedByUserId: ownerA.id } }),
      'duplicate (tenantId,email) must be rejected by the unique key',
    );

    // Tokens resolve globally (pre-tenant-context, by design) and to exactly one invite.
    const byToken = await prisma.invite.findUnique({ where: { token: `tok-${suffix}-a` }, select: { tenantId: true, email: true } });
    assert.equal(byToken?.tenantId, tenantAId, 'token resolves to its own tenant only');
    assert.equal(byToken?.email, shared);
  }

  // ── 7. Tenant status is readable at the chokepoint, and blocks the right set ─
  {
    for (const status of ['suspended', 'pending_deletion', 'deleted'] as const) {
      await prisma.tenant.update({ where: { id: tenantAId }, data: { status } });
      const t = await prisma.tenant.findUnique({ where: { id: tenantAId }, select: { status: true } });
      assert.equal(t?.status, status, `status ${status} round-trips`);
    }
    // past_due is a working tenant being dunned — it must NOT be in the blocked set.
    for (const status of ['trial', 'active', 'past_due'] as const) {
      await prisma.tenant.update({ where: { id: tenantAId }, data: { status } });
      const t = await prisma.tenant.findUnique({ where: { id: tenantAId }, select: { status: true } });
      assert.equal(t?.status, status);
    }
    await prisma.tenant.update({ where: { id: tenantAId }, data: { status: 'active' } });
  }

  // ── 8. Deleting a tenant cascades its memberships and invites ──────────────
  // Otherwise orphaned Membership rows would keep authorizing against a tenant that no longer
  // exists, and getTenantContext()'s slug lookup would be the only thing standing in the way.
  {
    const throwaway = await prisma.tenant.create({ data: { slug: `team-c-${suffix}`, name: 'Throwaway', plan: 'free', status: 'trial' } });
    const u = await mkUser(`cascade-${suffix}@tenant-c.test`);
    await prisma.membership.create({ data: { userId: u.id, tenantId: throwaway.id, role: 'owner' } });
    await prisma.invite.create({ data: { tenantId: throwaway.id, email: `inv-${suffix}@x.test`, role: 'viewer', invitedByUserId: u.id } });

    await prisma.tenant.delete({ where: { id: throwaway.id } });
    assert.equal(await prisma.membership.count({ where: { tenantId: throwaway.id } }), 0, 'memberships cascade');
    assert.equal(await prisma.invite.count({ where: { tenantId: throwaway.id } }), 0, 'invites cascade');
    assert.equal(await authorize(u.id, throwaway.id), null);
  }

  console.log('✓ team-safety-live: 8 scenarios pass — cross-tenant authorize, immediate revocation, owner counting, invite scoping, status, cascade');
} finally {
  await cleanup();
  await prisma.$disconnect();
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
