import { prisma } from "../src/lib/prisma";

/**
 * Expand/backfill/contract (EXPORT_OS_MASTER_PLAN §6.1, docs/EXPAND_CONTRACT_MIGRATIONS.md):
 * `owner` was added to MembershipRole as an expand step, treated identically to `super_admin`
 * everywhere (src/lib/permissions.ts ROLE_PERMISSIONS). Membership has one role per (userId,
 * tenantId) — @@unique([userId, tenantId]) — so there is nothing to *insert*; this backfill
 * converts every existing `super_admin` membership's role to `owner` in place.
 *
 * Idempotent: a tenant with no remaining `super_admin` memberships is a no-op. Safe to re-run
 * after promote-super-admin.ts or onboarding.ts create new `super_admin` rows (both still do,
 * unchanged in Wave 0 — see the plan's out-of-scope note).
 *
 * Run: npx tsx scripts/backfill-owner-role.ts [tenantSlug]
 *
 * super_admin itself is NOT removed from the MembershipRole enum by this script — that is the
 * later contract step (ALLOW_SCHEMA_DROP=1), gated on a clean deploy cycle once every membership
 * (and every code path checking role === 'super_admin') has moved to `owner`.
 */
async function main() {
  const tenantSlug = process.argv[2];

  const where = tenantSlug
    ? { role: "super_admin" as const, tenant: { slug: tenantSlug } }
    : { role: "super_admin" as const };

  // One-off backfill script — converts every tenant's super_admin memberships to owner by design
  // (optionally scoped to one tenant via argv above).
  // tenant-safe: cross-tenant backfill by design
  const toBackfill = await prisma.membership.findMany({
    where,
    include: { user: true, tenant: true },
  });

  if (toBackfill.length === 0) {
    console.log(tenantSlug ? `No super_admin memberships left for tenant "${tenantSlug}" — already backfilled.` : "No super_admin memberships left — already backfilled.");
    return;
  }

  for (const membership of toBackfill) {
    await prisma.membership.update({
      where: { id: membership.id, tenantId: membership.tenantId },
      data: { role: "owner" },
    });
    console.log(`${membership.user.email ?? membership.userId} → owner in tenant "${membership.tenant.slug}" (was super_admin)`);
  }

  console.log(`Backfilled ${toBackfill.length} membership(s) from super_admin to owner.`);

  // Invariant check (EXPORT_OS_MASTER_PLAN §6.2): every tenant must retain at least one owner.
  // Since this script only relabels existing super_admin rows 1:1, that invariant can't be broken
  // by running it — verify anyway as a guard against a future edit changing that assumption.
  const tenantIds = [...new Set(toBackfill.map((m) => m.tenantId))];
  const stillMissingOwner = await prisma.tenant.findMany({
    where: { id: { in: tenantIds }, memberships: { none: { role: "owner" } } },
    select: { slug: true },
  });
  if (stillMissingOwner.length > 0) {
    throw new Error(`last_owner invariant violated for: ${stillMissingOwner.map((t) => t.slug).join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
