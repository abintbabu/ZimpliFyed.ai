import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import assert from 'node:assert/strict';

/**
 * LIVE numbering test — EXPORT_OS_MASTER_PLAN §13.1 "Numbering" row: gapless under concurrent
 * issues, declared floor re-applied, post-issue immutability, cancel-at-nil. The pure FY-rollover/
 * character-rule subset lives in numbering.test.ts (no DB); this file needs a real Postgres
 * instance and CANNOT be run or verified in this sandbox (confirmed repeatedly in Wave 0 — no
 * DB/network access here). Run it yourself once `db push` has been applied.
 *
 * Unlike Wave 0's tenant-isolation-live.test.ts, this does NOT use a dedicated DIRECT_URL client:
 * issueDocSet/cancelExportDocument/issueDocNumber all import the shared `prisma` singleton
 * internally (src/lib/prisma.ts, hardwired to DATABASE_URL — a Supabase pooler) rather than
 * accepting a client parameter, so there's no way to point just this test at DIRECT_URL without
 * changing those functions' signatures. The concurrency case below (50 parallel transactions) is
 * exactly the scenario that pooler comment warns about — if it hangs or flakes, that's a signal
 * `src/lib/prisma.ts` itself needs a DIRECT_URL path for write-heavy concurrent callers, not a bug
 * in the numbering logic itself.
 *
 * Also note: issueDocSet/cancelExportDocument call src/lib/audit.ts's writeAudit(), which calls
 * next-auth's `auth()` to resolve the actor's email. `auth()` reads cookies/headers, which next-auth
 * v5 normally expects to run inside an active Next.js request — calling it from a plain `tsx` script
 * (as this test and scripts/create-test-users.ts etc. do) may throw rather than gracefully return
 * null. If issueDocSet/cancelExportDocument fail specifically inside writeAudit, that's this
 * pre-existing constraint of a helper built for the server-action context, not a numbering bug —
 * fixing it (e.g. an explicit actorEmail parameter) is a small follow-up, not done here since it's
 * unverified without a real DB/request to test against.
 *
 * Run: npm run test:doc-engine:live
 */

async function main() {
  const { prisma } = await import('../../lib/prisma');
  const { issueDocNumber } = await import('../../lib/doc-engine/numbering');
  const { issueDocSet, cancelExportDocument } = await import('../../lib/doc-engine/issue');

  const tag = `num-live-${Date.now()}`;
  const tenant = await prisma.tenant.create({ data: { slug: `${tag}-a`, name: 'Numbering Live Test' } });

  try {
    // ── Concurrency: N parallel issues must produce N unique, gapless serials ──────────────
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        prisma.$transaction((tx) => issueDocNumber(tx, tenant.id, 'commercial_invoice', 'in')),
      ),
    );
    const serials = results.map((r) => {
      const match = r.docNumber.match(/-(\d+)$/);
      assert.ok(match, `unexpected number format: ${r.docNumber}`);
      return Number(match[1]);
    });
    const uniqueSerials = new Set(serials);
    assert.equal(uniqueSerials.size, N, `expected ${N} unique serials, got ${uniqueSerials.size} — collision under concurrency`);
    const sorted = [...uniqueSerials].sort((a, b) => a - b);
    assert.deepEqual(sorted, Array.from({ length: N }, (_, i) => i + 1), 'serials must be gapless 1..N');
    console.log(`  ✓ ${N} concurrent issues: unique, gapless serials`);

    // ── Declared floor: re-applied every issue, only ever moves the run forward ────────────
    const series = await prisma.numberingSeries.findFirstOrThrow({ where: { tenantId: tenant.id, key: 'PL' } }).catch(() =>
      // PL series may not exist yet — issue one to auto-provision it, same as the concurrency block did for CI.
      prisma.$transaction((tx) => issueDocNumber(tx, tenant.id, 'packing_list', 'in')).then(() =>
        prisma.numberingSeries.findFirstOrThrow({ where: { tenantId: tenant.id, key: 'PL' } }),
      ),
    );
    await prisma.numberingSeries.update({ where: { id: series.id }, data: { declaredFloor: 500 } });
    const floored = await prisma.$transaction((tx) => issueDocNumber(tx, tenant.id, 'packing_list', 'in'));
    const flooredSerial = Number(floored.docNumber.match(/-(\d+)$/)![1]);
    assert.ok(flooredSerial >= 500, `declared floor not applied — got serial ${flooredSerial}, expected >= 500`);
    const next = await prisma.$transaction((tx) => issueDocNumber(tx, tenant.id, 'packing_list', 'in'));
    const nextSerial = Number(next.docNumber.match(/-(\d+)$/)![1]);
    assert.equal(nextSerial, flooredSerial + 1, 'the run continues forward past the floor, not re-checking it every time');
    console.log('  ✓ declared floor: applied once, run continues forward');

    // ── Issue → immutable → amend → cancel-at-nil, via a hand-built DocSet (no Order needed) ──
    const context = {
      tenant: {
        legalName: 'Numbering Live Test Co', registeredAddress: 'Test Address', iecNumber: '0123456789',
        gstin: '27AAPFU0939F1ZV', adCode: '6390123', bankName: 'Test Bank', bankAccountNumber: '123',
        bankIfscOrSwift: 'TEST0001', gstExportUnderLut: true, lutValidTo: '2099-01-01',
      },
      buyer: { name: 'Test Buyer', country: 'Germany', address: 'Test Address' },
      shipment: { incoterm: 'FOB', originPort: 'INMAA', destPort: 'DEHAM', destination: 'Germany' },
      currency: 'USD',
      issuedAt: '2026-01-15',
      lines: [{ description: 'Test goods', quantity: 10, unitPrice: 5, hsCode: '63026000' }],
    };
    const order = await prisma.order.create({ data: { tenantId: tenant.id, orderNumber: `${tag}-ORD` } });
    const docSet = await prisma.docSet.create({
      data: { tenantId: tenant.id, orderId: order.id, version: 1, status: 'draft', contextSnapshot: context, generatedByUserId: 'test' },
    });
    const doc = await prisma.exportDocument.create({
      data: { tenantId: tenant.id, orderId: order.id, type: 'commercial_invoice', version: 1, data: {}, docSetId: docSet.id, createdByUserId: 'test' },
    });

    const issued = await issueDocSet({ tenantId: tenant.id, docSetId: docSet.id, userId: 'test', role: 'admin' });
    assert.ok(issued.ok, 'first issue must succeed');
    const firstNumber = issued.ok ? issued.documents[0].docNumber : '';
    assert.notEqual(firstNumber, 'DRAFT', 'draft placeholder must be replaced with a real number at issue');

    const reissue = await issueDocSet({ tenantId: tenant.id, docSetId: docSet.id, userId: 'test', role: 'admin' });
    assert.equal(reissue.ok, false, 'issuing an already-approved set must fail — regenerate first');

    const cancelled = await cancelExportDocument({ tenantId: tenant.id, exportDocumentId: doc.id, userId: 'test', role: 'admin', reason: 'test cancellation' });
    assert.ok(cancelled.ok, 'cancelling an issued document must succeed');
    const afterCancel = await prisma.exportDocument.findUniqueOrThrow({ where: { id: doc.id } });
    assert.equal(afterCancel.docNumber, firstNumber, 'the number is retained on cancellation, never cleared or reused');
    assert.ok(afterCancel.cancelledAt, 'cancelledAt must be set');

    const doubleCancel = await cancelExportDocument({ tenantId: tenant.id, exportDocumentId: doc.id, userId: 'test', role: 'admin', reason: 'again' });
    assert.equal(doubleCancel.ok, false, 'cancelling an already-cancelled document must fail');

    const auditActions = await prisma.auditEntry.findMany({ where: { tenantId: tenant.id, documentId: doc.id }, select: { action: true } });
    assert.ok(auditActions.some((a) => a.action === 'issue'), 'an issue AuditEntry must be written');
    assert.ok(auditActions.some((a) => a.action === 'cancel'), 'a cancel AuditEntry must be written');
    console.log('  ✓ issue → immutable-after-approve → cancel-at-nil, with audit trail');

    console.log('✓ doc-engine numbering-live: concurrency, declared floor, issue/cancel lifecycle all correct');
  } finally {
    await prisma.auditEntry.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.exportDocument.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.docSet.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.order.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.numberingCounter.deleteMany({ where: { series: { tenantId: tenant.id } } });
    await prisma.numberingSeries.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ doc-engine numbering-live failed:', err);
  process.exit(1);
});
