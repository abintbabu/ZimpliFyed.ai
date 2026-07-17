import assert from 'node:assert/strict';
import JSZip from 'jszip';

/**
 * End-to-end integration tests against a REAL Postgres (the full production schema),
 * exercising the actual feature functions — demo seeding, data export, cash-flow
 * forecast, founder brief — plus cross-tenant isolation and financial/logical
 * consistency of persisted rows.
 *
 * Run: point DATABASE_URL at a throwaway local Postgres that has the schema loaded,
 * then `npm run test:integration`. It refuses to run against anything that isn't a
 * local loopback DB, so it can never touch the shared Supabase instance.
 *
 *   pg_dump --schema-only <DIRECT_URL> | psql <local>   # one-time schema load
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:5433/zimplifyed_test \
 *     tsx --conditions=react-server src/tests/integration/features.test.ts
 */

// tsx compiles to CJS (no top-level await), so the whole suite runs inside main().
async function main() {
// ── Safety guard: local loopback DBs only ─────────────────────────────────────
const url = process.env.DATABASE_URL ?? '';
const isLocal = /@(127\.0\.0\.1|localhost|::1)[:/]/.test(url) || url.includes('@localhost');
if (!url) {
  console.log('⊘ integration: DATABASE_URL not set — skipping (needs a local test Postgres)');
  process.exit(0);
}
if (!isLocal) {
  console.error(`✗ integration: refusing to run against non-local DB (${url.replace(/:[^:@/]+@/, ':****@')}).`);
  console.error('  Point DATABASE_URL at a throwaway local Postgres before running integration tests.');
  process.exit(1);
}

// Imported after the guard so the prisma singleton binds to the vetted local URL.
const { prisma } = await import('../../lib/prisma');
const { seedDemoData, clearDemoData } = await import('../../lib/seed-demo');
const { buildTenantExportZip } = await import('../../lib/data-export');
const { buildCashFlowForecast } = await import('../../lib/cash-flow-forecast');
const { buildFounderBrief } = await import('../../lib/founder-brief');
const { computeLandedCost } = await import('../../lib/landed-cost');

const approx = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;
const suffix = Date.now().toString(36);
const slugA = `itest-a-${suffix}`;
const slugB = `itest-b-${suffix}`;
let tenantAId = '';
let tenantBId = '';

async function cleanup() {
  for (const id of [tenantAId, tenantBId].filter(Boolean)) {
    // Wipe every tenant-scoped row, then the tenant. Child rows FK-cascade from parents;
    // we delete the top-level owners explicitly to avoid relying on cascade coverage.
    await prisma.invoice.deleteMany({ where: { tenantId: id } });
    await prisma.costSheet.deleteMany({ where: { tenantId: id } });
    await prisma.quote.deleteMany({ where: { tenantId: id } });
    await prisma.vendorRfq.deleteMany({ where: { tenantId: id } });
    await prisma.order.deleteMany({ where: { tenantId: id } });
    await prisma.task.deleteMany({ where: { tenantId: id } });
    await prisma.vendorRate.deleteMany({ where: { tenantId: id } });
    await prisma.vendor.deleteMany({ where: { tenantId: id } });
    await prisma.lead.deleteMany({ where: { tenantId: id } });
    await prisma.complianceItem.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.delete({ where: { id } }).catch(() => {});
  }
}

try {
  // ── Setup: two isolated tenants, seeded with realistic demo data ────────────
  const tenantA = await prisma.tenant.create({ data: { slug: slugA, name: 'Integration Tenant A', plan: 'free', status: 'trial' } });
  const tenantB = await prisma.tenant.create({ data: { slug: slugB, name: 'Integration Tenant B', plan: 'free', status: 'trial' } });
  tenantAId = tenantA.id;
  tenantBId = tenantB.id;

  await seedDemoData(tenantAId, 'merchant');
  await seedDemoData(tenantBId, 'manufacturer');

  // ── 1. Demo seed populated the expected entities for tenant A ───────────────
  {
    const [leads, vendors, quotes, orders, invoices, tasks, costSheets] = await Promise.all([
      prisma.lead.count({ where: { tenantId: tenantAId } }),
      prisma.vendor.count({ where: { tenantId: tenantAId } }),
      prisma.quote.count({ where: { tenantId: tenantAId } }),
      prisma.order.count({ where: { tenantId: tenantAId } }),
      prisma.invoice.count({ where: { tenantId: tenantAId } }),
      prisma.task.count({ where: { tenantId: tenantAId } }),
      prisma.costSheet.count({ where: { tenantId: tenantAId } }),
    ]);
    assert.equal(leads, 3, 'seed creates 3 leads');
    assert.equal(vendors, 2, 'seed creates 2 vendors');
    assert.equal(quotes, 2, 'seed creates 2 quotes');
    assert.equal(orders, 1, 'seed creates 1 order');
    assert.equal(invoices, 1, 'seed creates 1 invoice');
    assert.equal(tasks, 4, 'seed creates 4 tasks');
    assert.equal(costSheets, 1, 'seed creates 1 cost sheet');
  }

  // ── 2. businessType branches: merchant seeds an RFQ, manufacturer does not ───
  {
    const rfqA = await prisma.vendorRfq.count({ where: { tenantId: tenantAId } });
    const rfqB = await prisma.vendorRfq.count({ where: { tenantId: tenantBId } });
    assert.equal(rfqA, 1, 'merchant tenant gets a vendor RFQ');
    assert.equal(rfqB, 0, 'manufacturer tenant skips the vendor RFQ');
  }

  // ── 3. Seed idempotency: re-running does not duplicate ──────────────────────
  {
    await seedDemoData(tenantAId, 'merchant');
    const leads = await prisma.lead.count({ where: { tenantId: tenantAId } });
    assert.equal(leads, 3, 'second seed is a no-op (idempotent by demo rows)');
  }

  // ── 4. Financial consistency: line totals and header totals reconcile ───────
  {
    const quotes = await prisma.quote.findMany({ where: { tenantId: tenantAId }, include: { lines: true } });
    for (const q of quotes) {
      const linesSum = q.lines.reduce((s, l) => s + l.lineTotal, 0);
      assert.ok(approx(q.total, linesSum), `quote ${q.quoteNumber} total ${q.total} == Σ lines ${linesSum}`);
      for (const l of q.lines) {
        assert.ok(approx(l.lineTotal, l.quantity * l.unitPrice), `quote line total == qty*unitPrice`);
      }
    }
    const invoices = await prisma.invoice.findMany({ where: { tenantId: tenantAId }, include: { lines: true } });
    for (const inv of invoices) {
      const linesSum = inv.lines.reduce((s, l) => s + l.lineTotal, 0);
      assert.ok(approx(inv.total, linesSum), `invoice ${inv.invoiceNumber} total == Σ lines`);
      assert.ok(inv.balanceDue <= inv.total + 0.01, 'balanceDue never exceeds total');
    }
  }

  // ── 5. Landed-cost engine agrees with the persisted cost sheet ──────────────
  {
    const cs = await prisma.costSheet.findFirstOrThrow({ where: { tenantId: tenantAId }, include: { lines: true } });
    const result = computeLandedCost({
      incoterm: cs.incoterm,
      sellPricePerUnit: cs.sellPricePerUnit,
      rodtepPct: cs.rodtepPct,
      lines: cs.lines.map((l) => ({ category: l.category, amountPerUnit: l.amountPerUnit })),
    });
    // Cost sheet is FOB — the 6 seeded lines are all FOB-included categories, so none excluded.
    assert.equal(result.excludedLines.length, 0, 'all FOB cost lines are seller-borne under FOB');
    const rawSum = cs.lines.reduce((s, l) => s + l.amountPerUnit, 0);
    assert.ok(approx(result.grossCostPerUnit, rawSum), 'gross landed cost == Σ included lines');
    assert.ok(result.landedMarginPct !== undefined && result.landedMarginPct > 0, 'positive landed margin at the seeded sell price');
  }

  // ── 6. Cross-tenant isolation: export bundles only the owning tenant's rows ──
  {
    // Both tenants seed identical demo names, so isolation is proven by tenantId
    // ownership + row counts, not by name uniqueness.
    const zipBuf = await buildTenantExportZip(tenantAId);
    const zip = await JSZip.loadAsync(zipBuf);
    const dump = JSON.parse(await zip.file('full-export.json')!.async('string'));
    assert.equal(dump.leads.length, 3, 'export contains exactly tenant A leads (not A+B)');
    assert.equal(dump.vendors.length, 2, 'export contains exactly tenant A vendors');
    for (const row of [...dump.leads, ...dump.quotes, ...dump.orders, ...dump.invoices, ...dump.vendors]) {
      assert.equal(row.tenantId, tenantAId, 'every exported row belongs to tenant A');
    }
    assert.ok(zip.file('csv/invoices.csv'), 'export includes a per-module CSV');
  }

  // ── 7. Cash-flow forecast over REAL (non-demo) invoices, isolated per tenant ─
  {
    const now = Date.now();
    // A real overdue USD invoice for A, and a real invoice due next week.
    const orderA = await prisma.order.findFirstOrThrow({ where: { tenantId: tenantAId } });
    await prisma.invoice.create({
      data: {
        tenantId: tenantAId, isDemo: false, invoiceNumber: `RINV-A-OVERDUE-${suffix}`, orderId: orderA.id,
        status: 'sent', currency: 'USD', total: 1000, balanceDue: 1000, dueDate: new Date(now - 10 * 86_400_000),
      },
    });
    await prisma.invoice.create({
      data: {
        tenantId: tenantAId, isDemo: false, invoiceNumber: `RINV-A-SOON-${suffix}`, orderId: orderA.id,
        status: 'sent', currency: 'USD', total: 500, balanceDue: 500, dueDate: new Date(now + 5 * 86_400_000),
      },
    });
    // A real invoice for B that must NOT bleed into A's forecast.
    const orderB = await prisma.order.findFirstOrThrow({ where: { tenantId: tenantBId } });
    await prisma.invoice.create({
      data: {
        tenantId: tenantBId, isDemo: false, invoiceNumber: `RINV-B-${suffix}`, orderId: orderB.id,
        status: 'sent', currency: 'USD', total: 9999, balanceDue: 9999, dueDate: new Date(now + 5 * 86_400_000),
      },
    });

    const forecast = await buildCashFlowForecast(tenantAId);
    assert.ok(approx(forecast.overdueReceivables, 1000), `overdue receivables = 1000 (got ${forecast.overdueReceivables})`);
    assert.deepEqual(forecast.receivablesCurrencies, ['USD'], 'single-currency receivables');
    const bucketed = forecast.buckets.reduce((s, b) => s + b.receivables, 0);
    assert.ok(approx(bucketed, 500, 0.02), `soon-due 500 lands in a week bucket (got ${bucketed})`);
    // scheduledReceivablesTotal = overdue + Σ buckets.
    assert.ok(approx(forecast.scheduledReceivablesTotal, forecast.overdueReceivables + bucketed, 0.02), 'scheduled total == overdue + buckets');
    // Isolation: B's 9999 never shows up in A's numbers.
    assert.ok(forecast.scheduledReceivablesTotal < 9999, 'tenant B receivables excluded from A forecast');
  }

  // ── 8. Founder brief surfaces the overdue money as an urgent item ───────────
  {
    const brief = await buildFounderBrief(tenantAId);
    assert.ok(brief.cash.overdueCount >= 1, 'brief counts the overdue invoice');
    assert.ok(approx(brief.cash.overdueReceivables, 1000), 'brief overdue amount matches');
    assert.ok(brief.items.some((i) => i.severity === 'urgent'), 'an urgent item is raised for overdue money');
  }

  // ── 9. clearDemoData removes only demo rows, leaving real rows and tenant B ──
  {
    await clearDemoData(tenantAId);
    const demoLeads = await prisma.lead.count({ where: { tenantId: tenantAId, isDemo: true } });
    const realInvoices = await prisma.invoice.count({ where: { tenantId: tenantAId, isDemo: false } });
    const bLeads = await prisma.lead.count({ where: { tenantId: tenantBId } });
    assert.equal(demoLeads, 0, 'demo leads cleared for A');
    assert.equal(realInvoices, 2, 'real (non-demo) invoices survive the demo sweep');
    assert.equal(bLeads, 3, 'tenant B is untouched by A cleardown');
  }

  console.log('✓ integration: 9 scenarios pass — seed, isolation, export, cash-flow, founder-brief, financial consistency');
} finally {
  await cleanup();
  await prisma.$disconnect();
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
