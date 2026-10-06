import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import assert from 'node:assert/strict';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { balances, type MovementKind } from '../../lib/stock';

/**
 * LIVE database behaviour for the V2/V3 modules: the constraints, cascades and idempotency the application code
 * relies on. The unit tests cover the logic; this covers what only a real Postgres can prove. Needs a throwaway
 * local database (see docs / zimplifyed-local-test-db) and, like the isolation test, uses DIRECT_URL.
 *
 * Run: DIRECT_URL=postgresql://…/local npx tsx src/tests/supply/new-modules-live.test.ts
 */

const url = process.env.DIRECT_URL;
if (!url) throw new Error('DIRECT_URL must be set');
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error('Refusing to run: DIRECT_URL is not a local database');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function rejects(p: Promise<unknown>, code: string, msg: string) {
  try { await p; } catch (e) {
    assert.ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === code, `${msg}: expected ${code}, got ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    return;
  }
  assert.fail(`${msg}: expected a ${code} error but the write succeeded`);
}

async function main() {
  const tag = `v2-live-${Date.now()}`;
  const A = await prisma.tenant.create({ data: { slug: `${tag}-a`, name: 'V2 A' } });
  const B = await prisma.tenant.create({ data: { slug: `${tag}-b`, name: 'V2 B' } });
  const ids = [A.id, B.id];

  try {
    // ── Bank statement import is idempotent on the fingerprint ────────────────
    {
      const row = (n: string) => ({ tenantId: A.id, importBatch: 'b1', fingerprint: `${tag}-${n}`, txnDate: new Date(), narration: 'NEFT', amount: 100 });
      const first = await prisma.bankStatementLine.createMany({ data: [row('1'), row('2')], skipDuplicates: true });
      const again = await prisma.bankStatementLine.createMany({ data: [row('1'), row('2'), row('3')], skipDuplicates: true });
      assert.equal(first.count, 2); assert.equal(again.count, 1, 're-importing an overlapping statement adds only the new line');
      const otherTenant = await prisma.bankStatementLine.createMany({ data: [{ ...row('1'), tenantId: B.id }], skipDuplicates: true });
      assert.equal(otherTenant.count, 1, 'the same fingerprint is allowed for a different tenant');
      console.log('  ✓ bank statement import is idempotent per tenant');
    }

    // ── Purchase orders: number unique per tenant; one PO per RFQ ─────────────
    const vendorA = await prisma.vendor.create({ data: { tenantId: A.id, name: 'Yarn Co' } });
    const vendorB = await prisma.vendor.create({ data: { tenantId: B.id, name: 'Yarn Co' } });
    {
      await prisma.purchaseOrder.create({ data: { tenantId: A.id, poNumber: 'PO-1', vendorId: vendorA.id, createdByUserId: 'u' } });
      await rejects(prisma.purchaseOrder.create({ data: { tenantId: A.id, poNumber: 'PO-1', vendorId: vendorA.id, createdByUserId: 'u' } }), 'P2002', 'duplicate PO number in one tenant');
      await prisma.purchaseOrder.create({ data: { tenantId: B.id, poNumber: 'PO-1', vendorId: vendorB.id, createdByUserId: 'u' } });
      const rfq = await prisma.vendorRfq.create({ data: { tenantId: A.id, rfqNumber: `${tag}-R`, title: 'Yarn' } });
      await prisma.purchaseOrder.create({ data: { tenantId: A.id, poNumber: 'PO-2', vendorId: vendorA.id, vendorRfqId: rfq.id, createdByUserId: 'u' } });
      await rejects(prisma.purchaseOrder.create({ data: { tenantId: A.id, poNumber: 'PO-3', vendorId: vendorA.id, vendorRfqId: rfq.id, createdByUserId: 'u' } }), 'P2002', 'two POs from one RFQ (double-click safety net)');
      console.log('  ✓ PO number unique per tenant; one PO per RFQ');
    }

    // ── A vendor with a PO cannot be deleted out from under it (Restrict) ─────
    await rejects(prisma.vendor.delete({ where: { id: vendorA.id } }), 'P2003', 'deleting a vendor that has purchase orders');
    console.log('  ✓ vendor with purchase orders is protected from deletion');

    // ── Vendor bills: unique per vendor, not globally ─────────────────────────
    {
      const mk = (tenantId: string, vendorId: string, billNumber: string) => prisma.vendorBill.create({ data: { tenantId, vendorId, billNumber, billDate: new Date(), total: 10, createdByUserId: 'u' } });
      await mk(A.id, vendorA.id, 'B-1');
      await rejects(mk(A.id, vendorA.id, 'B-1'), 'P2002', 'same supplier bill number twice');
      const vendor2 = await prisma.vendor.create({ data: { tenantId: A.id, name: 'Other' } });
      await mk(A.id, vendor2.id, 'B-1');
      console.log('  ✓ supplier bill numbers are unique per vendor');
    }

    // ── Order cascade: lines and packing go with the order ────────────────────
    {
      const order = await prisma.order.create({ data: { tenantId: A.id, orderNumber: `${tag}-O`, currency: 'USD' } });
      const line = await prisma.orderLineItem.create({ data: { orderId: order.id, description: 'Towel', quantity: 10, unitPrice: 2, lineTotal: 20 } });
      await prisma.packingEntry.create({ data: { orderId: order.id, orderLineId: line.id, cartonCount: 2, qtyPerCarton: 5, netWeightKg: 4, grossWeightKg: 5, lengthCm: 60, widthCm: 40, heightCm: 40 } });
      await prisma.order.delete({ where: { id: order.id } });
      assert.equal(await prisma.orderLineItem.count({ where: { orderId: order.id } }), 0);
      assert.equal(await prisma.packingEntry.count({ where: { orderId: order.id } }), 0);
      console.log('  ✓ deleting an order removes its lines and packing');
    }

    // ── Deleting a line only detaches packing (SetNull), never deletes it ─────
    {
      const order = await prisma.order.create({ data: { tenantId: A.id, orderNumber: `${tag}-O2` } });
      const line = await prisma.orderLineItem.create({ data: { orderId: order.id, description: 'Sheet', quantity: 1, unitPrice: 1, lineTotal: 1 } });
      const pack = await prisma.packingEntry.create({ data: { orderId: order.id, orderLineId: line.id, cartonCount: 1, qtyPerCarton: 1, netWeightKg: 1, grossWeightKg: 1, lengthCm: 1, widthCm: 1, heightCm: 1 } });
      await prisma.orderLineItem.delete({ where: { id: line.id } });
      assert.equal((await prisma.packingEntry.findUniqueOrThrow({ where: { id: pack.id } })).orderLineId, null);
      console.log('  ✓ removing an order line keeps the packing row, unlinked');
    }

    // ── Vendor-portal token is unique ─────────────────────────────────────────
    {
      const rfq = await prisma.vendorRfq.create({ data: { tenantId: A.id, rfqNumber: `${tag}-R2`, title: 'Cartons' } });
      const v2 = await prisma.vendor.create({ data: { tenantId: A.id, name: 'Carton Co' } });
      await prisma.vendorRfqInvite.create({ data: { rfqId: rfq.id, vendorId: vendorA.id, token: `${tag}-hash`, tokenExpiresAt: new Date() } });
      await rejects(prisma.vendorRfqInvite.create({ data: { rfqId: rfq.id, vendorId: v2.id, token: `${tag}-hash` } }), 'P2002', 'two invites sharing one token hash');
      const noToken = await prisma.vendorRfqInvite.createMany({ data: [{ rfqId: rfq.id, vendorId: v2.id }] });
      assert.equal(noToken.count, 1, 'invites without a portal token are unaffected by the unique index');
      console.log('  ✓ portal tokens are unique; invites without one are fine');
    }

    // ── Stock balance from real movements equals the pure function ────────────
    {
      const item = await prisma.stockItem.create({ data: { tenantId: A.id, sku: `${tag}-S`, name: 'Yarn' } });
      await rejects(prisma.stockItem.create({ data: { tenantId: A.id, sku: `${tag}-S`, name: 'Dup' } }), 'P2002', 'same SKU at the same location');
      await prisma.stockItem.create({ data: { tenantId: A.id, sku: `${tag}-S`, name: 'Yarn (Chennai)', location: 'CHENNAI' } });
      for (const [kind, quantity] of [['receipt', 100], ['issue', 30], ['adjustment', -2], ['receipt', 0.5]] as const) {
        await prisma.stockMovement.create({ data: { tenantId: A.id, itemId: item.id, kind, quantity, createdByUserId: 'u' } });
      }
      const rows = await prisma.stockMovement.groupBy({ by: ['itemId', 'kind'], where: { tenantId: A.id, itemId: item.id }, _sum: { quantity: true } });
      const bal = balances(rows.map((r) => ({ itemId: r.itemId, kind: r.kind as MovementKind, quantity: r._sum.quantity ?? 0 })));
      assert.equal(bal.get(item.id), 68.5, '100 − 30 − 2 + 0.5');
      console.log('  ✓ stock balance from the database matches the pure calculation');
    }

    // ── New enum values are accepted by the real database ─────────────────────
    {
      const order = await prisma.order.create({ data: { tenantId: A.id, orderNumber: `${tag}-O3` } });
      await prisma.complianceItem.create({ data: { tenantId: A.id, category: 'coo', name: 'COO', orderId: order.id } });
      await prisma.complianceItem.create({ data: { tenantId: A.id, category: 'phytosanitary', name: 'Phyto' } });
      const quote = await prisma.quote.create({ data: { tenantId: A.id, quoteNumber: `${tag}-Q` } });
      const sheet = await prisma.costSheet.create({ data: { tenantId: A.id, quoteId: quote.id, incoterm: 'FOB', sellPricePerUnit: 5 } });
      for (const category of ['commission', 'bank_charges', 'documentation'] as const) await prisma.costSheetLine.create({ data: { costSheetId: sheet.id, category, amountPerUnit: 0.1 } });
      await prisma.actionQueueItem.create({ data: { tenantId: A.id, kind: 'lc_deadline', department: 'COMPLY', title: 't', summary: 's' } });
      const lc = await prisma.letterOfCredit.create({ data: { tenantId: A.id, orderId: order.id, rawText: '', amount: 1000, currency: 'USD', expiryDate: new Date(), requiredDocuments: ['Invoice'], createdByUserId: 'u' } });
      assert.equal(lc.status, 'draft', 'a new LC defaults to draft');
      console.log('  ✓ new enum values (certificates, cost heads, lc_deadline, LC status) are accepted');
    }

    // ── Credit note linkage and the typed note kind ───────────────────────────
    {
      const inv = await prisma.invoice.create({ data: { tenantId: A.id, invoiceNumber: `${tag}-I`, total: 1000, balanceDue: 1000 } });
      const cn = await prisma.invoice.create({ data: { tenantId: A.id, invoiceNumber: `${tag}-CN`, total: 200, balanceDue: 200, isCreditOrDebitNote: true, noteKind: 'credit', originalInvoiceId: inv.id, noteReason: 'Damaged' } });
      const credited = await prisma.invoice.aggregate({ where: { tenantId: A.id, originalInvoiceId: inv.id, noteKind: 'credit', status: { not: 'void' } }, _sum: { total: true } });
      assert.equal(credited._sum.total, cn.total, 'the aggregate the balance sync uses finds the credit note');
      console.log('  ✓ credit notes link to their invoice and aggregate correctly');
    }

    // ── Products: variants unique per product; dimensions persist ─────────────
    {
      const product = await prisma.product.create({ data: { tenantId: A.id, sku: `${tag}-P`, name: 'Towel', lengthCm: 60, widthCm: 40, heightCm: 40, grossWeightKg: 20 } });
      await prisma.productVariant.create({ data: { productId: product.id, sku: 'W', name: 'White' } });
      await rejects(prisma.productVariant.create({ data: { productId: product.id, sku: 'W', name: 'Dup' } }), 'P2002', 'duplicate variant SKU on one product');
      const other = await prisma.product.create({ data: { tenantId: A.id, sku: `${tag}-P2`, name: 'Sheet' } });
      await prisma.productVariant.create({ data: { productId: other.id, sku: 'W', name: 'White' } });
      console.log('  ✓ variant SKUs are unique per product');
    }

    // ── Deleting a forwarder keeps its quotes (SetNull) ───────────────────────
    {
      const fwd = await prisma.forwarder.create({ data: { tenantId: A.id, name: `${tag}-Fwd` } });
      await rejects(prisma.forwarder.create({ data: { tenantId: A.id, name: `${tag}-Fwd` } }), 'P2002', 'duplicate forwarder name');
      const shipment = await prisma.shipment.create({ data: { tenantId: A.id, shipmentNumber: `${tag}-S`, mode: 'sea_lcl' } });
      const fq = await prisma.freightQuote.create({ data: { tenantId: A.id, shipmentId: shipment.id, forwarderId: fwd.id, forwarderName: 'Fwd', mode: 'sea_lcl', amount: 100 } });
      await prisma.forwarder.delete({ where: { id: fwd.id } });
      assert.equal((await prisma.freightQuote.findUniqueOrThrow({ where: { id: fq.id } })).forwarderId, null);
      console.log('  ✓ deleting a forwarder keeps its freight quotes');
    }

    console.log('✓ new-modules-live: constraints, cascades, idempotency and enums behave on a real Postgres');
  } finally {
    // Tenant cascade removes tenant-scoped rows; vendors have Restrict from POs so purge POs/bills first.
    await prisma.vendorBill.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.purchaseOrder.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error('✗ new-modules-live failed:', err); process.exit(1); });
