import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fall back to .env

import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * LIVE two-tenant isolation test — Layer 3 (proof), EXPORT_OS_MASTER_PLAN §5.3. The runtime
 * counterpart to the static analysis in tenant-isolation.test.ts (Layer 1). Needs a real DB.
 *
 * Deliberately connects via DIRECT_URL (port 5432), not the shared `prisma` export from
 * src/lib/prisma.ts (which is hardwired to DATABASE_URL, a Supabase pooler) — iterating several
 * models' worth of creates/reads/updates through a pooler risks the connection-limit hang that
 * motivated keeping this test out of `test:security` in the first place. A dedicated client here
 * keeps that concern local to this one file.
 *
 * Scope, honestly: this proves that a MANUALLY tenantId-scoped query (the `where: { ..., tenantId }`
 * convention every action file already follows, and that tenant-isolation.test.ts verifies is present
 * at every call site) actually behaves correctly against real Postgres — reads don't leak, and a
 * targeted update/delete with the wrong tenantId in its `where` affects zero rows. It does NOT yet
 * test the tenant-scope Prisma extension's enforcement (src/lib/tenant-scope.ts) — e.g. "a create
 * under tenant A with tenant B's tenantId throws" — because that extension is deliberately not wired
 * into the live client yet (see src/lib/prisma.ts's header comment: adopting it requires migrating
 * every existing call site to withTenant()/withPlatformScope() first, tracked as separate follow-up
 * work beyond Wave 0). Add that assertion here once the extension is live.
 *
 * Model coverage: a curated subset of TENANT_SCOPED_MODELS with simple, well-understood required
 * fields (Buyer, Order, Lead, Task, TenantFact, FeatureFlag) — not yet all ~46 generated models.
 * Extending FIXTURES below to the rest is real, incremental work: each model needs its required
 * fields and any FK dependencies worked out from prisma/schema.prisma, and — since this sandbox has
 * no DB access — verified against a real Postgres instance before being trusted. Do that
 * incrementally as each domain module is actively touched, not as a blind mechanical pass.
 *
 * Run: npm run test:security:live
 */

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  throw new Error('DIRECT_URL must be set — this test intentionally avoids the DATABASE_URL pooler.');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl }) });

type Fixture = {
  /** Creates one row for `tenantId`, tagged for easy identification/cleanup. Must return `id`. */
  create: (tenantId: string, tag: string) => Promise<{ id: string }>;
  /** Deletes every row this fixture created for the given tenant ids. */
  cleanup: (tenantIds: string[]) => Promise<void>;
  /** `findMany` scoped exactly the way action files do it. */
  findMany: (tenantId: string) => Promise<{ id: string }[]>;
  /** Point lookup under a (possibly wrong) tenant scope — must return null on a cross-tenant id. */
  findScoped: (id: string, tenantId: string) => Promise<{ id: string } | null>;
  /** Targeted update under a (possibly wrong) tenant scope — returns the affected row count. */
  updateScopedCount: (id: string, tenantId: string) => Promise<number>;
};

const FIXTURES: Record<string, Fixture> = {
  Buyer: {
    create: (tenantId, tag) => prisma.buyer.create({ data: { tenantId, name: `${tag} Buyer` } }),
    cleanup: (tenantIds) => prisma.buyer.deleteMany({ where: { tenantId: { in: tenantIds } } }).then(() => undefined),
    findMany: (tenantId) => prisma.buyer.findMany({ where: { tenantId }, select: { id: true } }),
    findScoped: (id, tenantId) => prisma.buyer.findFirst({ where: { id, tenantId } }),
    updateScopedCount: async (id, tenantId) =>
      (await prisma.buyer.updateMany({ where: { id, tenantId }, data: { name: 'updated' } })).count,
  },
  Order: {
    create: async (tenantId, tag) => {
      const buyer = await prisma.buyer.create({ data: { tenantId, name: `${tag} Order Buyer` } });
      return prisma.order.create({ data: { tenantId, orderNumber: `${tag}-ORD`, buyerId: buyer.id } });
    },
    cleanup: (tenantIds) => prisma.order.deleteMany({ where: { tenantId: { in: tenantIds } } }).then(() => undefined),
    findMany: (tenantId) => prisma.order.findMany({ where: { tenantId }, select: { id: true } }),
    findScoped: (id, tenantId) => prisma.order.findFirst({ where: { id, tenantId } }),
    updateScopedCount: async (id, tenantId) =>
      (await prisma.order.updateMany({ where: { id, tenantId }, data: { orderNumber: `updated-${id}` } })).count,
  },
  Lead: {
    create: (tenantId, tag) => prisma.lead.create({ data: { tenantId, source: 'manual', name: `${tag} Lead` } }),
    cleanup: (tenantIds) => prisma.lead.deleteMany({ where: { tenantId: { in: tenantIds } } }).then(() => undefined),
    findMany: (tenantId) => prisma.lead.findMany({ where: { tenantId }, select: { id: true } }),
    findScoped: (id, tenantId) => prisma.lead.findFirst({ where: { id, tenantId } }),
    updateScopedCount: async (id, tenantId) =>
      (await prisma.lead.updateMany({ where: { id, tenantId }, data: { notes: 'updated' } })).count,
  },
  Task: {
    create: (tenantId, tag) =>
      prisma.task.create({
        data: {
          tenantId, title: `${tag} Task`, priority: 'low',
          assigneeUserId: 'iso-live-test', assigneeName: 'Isolation Test', assigneeRole: 'admin',
          createdByUserId: 'iso-live-test',
        },
      }),
    cleanup: (tenantIds) => prisma.task.deleteMany({ where: { tenantId: { in: tenantIds } } }).then(() => undefined),
    findMany: (tenantId) => prisma.task.findMany({ where: { tenantId }, select: { id: true } }),
    findScoped: (id, tenantId) => prisma.task.findFirst({ where: { id, tenantId } }),
    updateScopedCount: async (id, tenantId) =>
      (await prisma.task.updateMany({ where: { id, tenantId }, data: { description: 'updated' } })).count,
  },
  TenantFact: {
    create: (tenantId, tag) => prisma.tenantFact.create({ data: { tenantId, category: 'test', text: `${tag} fact` } }),
    cleanup: (tenantIds) => prisma.tenantFact.deleteMany({ where: { tenantId: { in: tenantIds } } }).then(() => undefined),
    findMany: (tenantId) => prisma.tenantFact.findMany({ where: { tenantId }, select: { id: true } }),
    findScoped: (id, tenantId) => prisma.tenantFact.findFirst({ where: { id, tenantId } }),
    updateScopedCount: async (id, tenantId) =>
      (await prisma.tenantFact.updateMany({ where: { id, tenantId }, data: { text: 'updated' } })).count,
  },
  FeatureFlag: {
    create: (tenantId, tag) => prisma.featureFlag.create({ data: { tenantId, key: `${tag}-flag`, enabled: true } }),
    cleanup: (tenantIds) => prisma.featureFlag.deleteMany({ where: { tenantId: { in: tenantIds } } }).then(() => undefined),
    findMany: (tenantId) => prisma.featureFlag.findMany({ where: { tenantId }, select: { id: true } }),
    findScoped: (id, tenantId) => prisma.featureFlag.findFirst({ where: { id, tenantId } }),
    updateScopedCount: async (id, tenantId) =>
      (await prisma.featureFlag.updateMany({ where: { id, tenantId }, data: { enabled: false } })).count,
  },
};

async function main() {
  const tag = `iso-live-${Date.now()}`;
  const tenantA = await prisma.tenant.create({ data: { slug: `${tag}-a`, name: 'Isolation Test A' } });
  const tenantB = await prisma.tenant.create({ data: { slug: `${tag}-b`, name: 'Isolation Test B' } });

  try {
    for (const [model, fixture] of Object.entries(FIXTURES)) {
      const rowA = await fixture.create(tenantA.id, `${tag}-A`);
      const rowB = await fixture.create(tenantB.id, `${tag}-B`);

      const listA = await fixture.findMany(tenantA.id);
      assert.ok(!listA.some((r) => r.id === rowB.id), `${model}: tenant A's list must not include tenant B's row`);
      assert.ok(listA.some((r) => r.id === rowA.id), `${model}: tenant A's list must include its own row`);

      const cross = await fixture.findScoped(rowB.id, tenantA.id);
      assert.equal(cross, null, `${model}: tenant A point-lookup of tenant B's row id must return null`);

      const affected = await fixture.updateScopedCount(rowB.id, tenantA.id);
      assert.equal(affected, 0, `${model}: an update targeting tenant B's row under tenant A's scope must affect zero rows`);

      console.log(`  ✓ ${model}`);
    }
    console.log(`✓ tenant-isolation-live: ${Object.keys(FIXTURES).length} model(s), 2 tenants each — no cross-tenant reads/writes possible`);
  } finally {
    for (const fixture of Object.values(FIXTURES)) {
      await fixture.cleanup([tenantA.id, tenantB.id]);
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ tenant-isolation-live failed:', err);
  process.exit(1);
});
