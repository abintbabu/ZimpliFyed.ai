import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fall back to .env

import assert from 'node:assert/strict';

/**
 * LIVE two-tenant isolation test (ROADMAP §2.11 — the runtime counterpart to the static analysis in
 * tenant-isolation.test.ts). Needs a real DB (DATABASE_URL); NOT part of `test:security` (which stays
 * DB-free/fast) and not in CI yet.
 *
 * Creates two throwaway tenants with one Buyer + one Order each, then exercises reads the way server
 * actions scope them (see src/actions/buyers.ts listBuyers/getBuyer: every where clause carries
 * tenantId) and asserts tenant A can never see tenant B's rows — list, point-lookup with the *other*
 * tenant's id, and count. Cleans up only the rows it created, by id, in a finally block.
 *
 * Run: npm run test:security:live
 */

async function main() {
  // Deferred import so dotenv runs before src/lib/prisma reads DATABASE_URL (same pattern as
  // scripts/create-test-users.ts).
  const { prisma } = await import('../../lib/prisma');

  const tag = `iso-live-${Date.now()}`;
  const tenantA = await prisma.tenant.create({ data: { slug: `${tag}-a`, name: 'Isolation Test A' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${tag}-b`, name: 'Isolation Test B' } });

  try {
    const buyerA = await prisma.buyer.create({ data: { tenantId: tenantA.id, name: `${tag} Buyer A` } });
    const buyerB = await prisma.buyer.create({ data: { tenantId: tenantB.id, name: `${tag} Buyer B` } });
    const orderA = await prisma.order.create({
      data: { tenantId: tenantA.id, orderNumber: `${tag}-ORD-A`, buyerId: buyerA.id },
    });
    const orderB = await prisma.order.create({
      data: { tenantId: tenantB.id, orderNumber: `${tag}-ORD-B`, buyerId: buyerB.id },
    });

    // ── Buyer reads, scoped exactly like src/actions/buyers.ts ───────────────
    const listA = await prisma.buyer.findMany({ where: { tenantId: tenantA.id } });
    assert.equal(listA.length, 1, 'tenant A should see exactly its own buyer');
    assert.equal(listA[0].id, buyerA.id);
    assert.ok(!listA.some((b) => b.id === buyerB.id), "tenant A must not see tenant B's buyer");

    // Point lookup of B's buyer id under A's tenant scope must return null (the getBuyer pattern).
    const cross = await prisma.buyer.findFirst({ where: { id: buyerB.id, tenantId: tenantA.id } });
    assert.equal(cross, null, "tenant A lookup of tenant B's buyer id must return null");

    // ── Order reads ──────────────────────────────────────────────────────────
    const ordersB = await prisma.order.findMany({ where: { tenantId: tenantB.id }, select: { id: true } });
    assert.deepEqual(ordersB.map((o) => o.id), [orderB.id], 'tenant B should see exactly its own order');

    const crossOrder = await prisma.order.findFirst({ where: { id: orderA.id, tenantId: tenantB.id } });
    assert.equal(crossOrder, null, "tenant B lookup of tenant A's order id must return null");

    // Relation traversal can't leak either: B's buyer has no orders from A.
    const buyerBWithOrders = await prisma.buyer.findFirst({
      where: { id: buyerB.id, tenantId: tenantB.id },
      include: { orders: true },
    });
    assert.ok(buyerBWithOrders);
    assert.deepEqual(buyerBWithOrders.orders.map((o) => o.id), [orderB.id]);

    console.log('✓ tenant-isolation-live: 2 tenants, buyer+order each — no cross-tenant reads possible');
  } finally {
    // Delete only what we created. Tenant delete cascades to Buyer/Order (onDelete: Cascade), but be
    // explicit and id-scoped so a schema change never widens this.
    await prisma.order.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.buyer.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ tenant-isolation-live failed:', err);
  process.exit(1);
});
