import 'server-only';
import { prisma } from './prisma';
import type { BusinessType } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { getPack } from '@/packs/registry';

/**
 * Seeds a realistic demo dataset for a freshly-created tenant. Every row is
 * flagged `isDemo: true` so `clearDemoData` can remove them in one sweep and
 * analytics/export helpers can exclude them. Idempotent by tenantId: bails if
 * demo rows already exist. ComplianceItems are seeded as REAL (not demo) —
 * they represent onboarding checklist items the owner must fill in.
 */
export async function seedDemoData(tenantId: string, businessType: BusinessType, packId = 'in') {
  const existing = await prisma.lead.count({ where: { tenantId, isDemo: true } });
  if (existing > 0) return;
  const pack = getPack(packId);

  const now = Date.now();
  const daysFromNow = (d: number) => new Date(now + d * 86_400_000);

  // ── Leads ──
  await prisma.lead.createMany({
    data: [
      { tenantId, isDemo: true, source: 'whatsapp', name: 'Faisal Rahman', company: 'Al Noor Trading LLC, Dubai', country: 'AE', itemsInterested: 'Cotton bath towels', stage: 'New', quality: 'Strong', leadNumber: 1001, nextFollowUpAt: daysFromNow(2) },
      { tenantId, isDemo: true, source: 'inquiry', name: 'Sophie Laurent', company: 'Maison du Linge, Paris', country: 'FR', itemsInterested: 'Waffle bathrobes', stage: 'Quoted_Invoice', quality: 'Medium', leadNumber: 1002, nextFollowUpAt: daysFromNow(5) },
      { tenantId, isDemo: true, source: 'rfq', name: 'James Miller', company: 'Coastal Hospitality Group, UK', country: 'GB', itemsInterested: 'Hotel bed linen sets', stage: 'Follow_Up', quality: 'Strong', leadNumber: 1003, nextFollowUpAt: daysFromNow(1) },
    ],
  });

  // ── Vendors + rates ──
  const vendorA = await prisma.vendor.create({
    data: { tenantId, isDemo: true, name: 'Karur Textile Mills', contactName: 'R. Subramaniam', email: 'sales@karurtextile.example', phone: '+91 98430 00000' },
  });
  const vendorB = await prisma.vendor.create({
    data: { tenantId, isDemo: true, name: 'Erode Weaving Co.', contactName: 'M. Prakash', email: 'prakash@erodeweaving.example', phone: '+91 99940 00000' },
  });
  await prisma.vendorRate.create({
    data: {
      tenantId, vendorId: vendorA.id, sku: 'TWL-BATH-500', description: 'Bath towel 500 GSM 70x140',
      method: 'per_piece', baseRate: 3.2, normalizedPieceCost: 3.2, moqPieces: 500, leadTimeDays: 25, isPreferred: true,
      tiers: { create: [{ minQty: 1000, rate: 3.0 }, { minQty: 5000, rate: 2.8 }] },
    },
  });
  await prisma.vendorRate.create({
    data: { tenantId, vendorId: vendorA.id, sku: 'ROBE-WAFFLE-M', description: 'Waffle bathrobe medium', method: 'per_piece', baseRate: 6.5, normalizedPieceCost: 6.5, moqPieces: 300, leadTimeDays: 30 },
  });
  await prisma.vendorRate.create({
    data: { tenantId, vendorId: vendorB.id, sku: 'BED-SET-QUEEN', description: 'Hotel bed linen set (queen)', method: 'per_piece', baseRate: 12.0, normalizedPieceCost: 12.0, moqPieces: 200, leadTimeDays: 35 },
  });

  // ── Vendor RFQ (merchant) with 2 invites + 1 quote received ──
  if (businessType !== 'manufacturer') {
    const rfq = await prisma.vendorRfq.create({
      data: {
        tenantId, rfqNumber: 'RFQ-1001', title: 'Bath towels 500 GSM — 5000 pcs', description: 'For Al Noor Trading order',
        quantity: 5000, unit: 'pcs', targetPrice: 2.9, dueDate: daysFromNow(7), status: 'open',
        invites: { create: [{ vendorId: vendorA.id }, { vendorId: vendorB.id }] },
      },
    });
    await prisma.vendorRfqQuote.create({
      data: { rfqId: rfq.id, vendorId: vendorA.id, rate: 2.85, moqPieces: 1000, leadTimeDays: 25, notes: 'Includes branded packaging' },
    });
  }

  // ── Quotes (+ cost sheet on one) ──
  const quoteDraft = await prisma.quote.create({
    data: {
      tenantId, isDemo: true, quoteNumber: 'Q-1001', status: 'draft', currency: 'USD', total: 21250, overallMarginPct: 22,
      lines: { create: [{ description: 'Bath towel 500 GSM 70x140', quantity: 5000, cost: 2.85, expensePct: 8, marginPct: 22, unitPrice: 4.25, lineTotal: 21250 }] },
    },
  });
  await prisma.quote.create({
    data: {
      tenantId, isDemo: true, quoteNumber: 'Q-1002', status: 'sent', currency: 'EUR', total: 9750, overallMarginPct: 25,
      lines: { create: [{ description: 'Waffle bathrobe medium', quantity: 1000, cost: 6.5, expensePct: 7, marginPct: 25, unitPrice: 9.75, lineTotal: 9750 }] },
    },
  });
  await prisma.costSheet.create({
    data: {
      tenantId, isDemo: true, quoteId: quoteDraft.id, incoterm: 'FOB', sellPricePerUnit: 4.25, rodtepPct: 1.4,
      lines: {
        create: [
          { category: 'material', label: 'Greige + yarn', amountPerUnit: 2.1 },
          { category: 'conversion', label: 'Weaving + processing', amountPerUnit: 0.55 },
          { category: 'packing', label: 'Poly + carton', amountPerUnit: 0.2 },
          { category: 'inland_freight', label: 'Karur → Tuticorin', amountPerUnit: 0.12 },
          { category: 'cha', label: 'CHA + docs', amountPerUnit: 0.08 },
          { category: 'port', label: 'THC', amountPerUnit: 0.1 },
        ],
      },
    },
  });

  // ── Order + buyer-track + invoice ──
  const order = await prisma.order.create({
    data: {
      tenantId, isDemo: true, orderNumber: 'SO-1001', status: 'in_production', product: 'Bath towels 500 GSM',
      quantity: 5000, unit: 'pcs', incoterm: 'FOB', destination: 'Dubai, AE', originPort: 'INTUT', destPort: 'AEJEA',
    },
  });
  await prisma.orderBuyerTrack.create({
    data: { orderId: order.id, token: randomBytes(12).toString('hex'), createdByUserId: 'demo' },
  });
  await prisma.invoice.create({
    data: {
      tenantId, isDemo: true, invoiceNumber: 'INV-1001', orderId: order.id, status: 'partially_paid', currency: 'USD',
      total: 21250, balanceDue: 10625, dueDate: daysFromNow(15),
      lines: { create: [{ description: 'Bath towel 500 GSM 70x140', quantity: 5000, cost: 2.85, expensePct: 8, marginPct: 22, unitPrice: 4.25, lineTotal: 21250 }] },
    },
  });

  // ── Tasks ──
  await prisma.task.createMany({
    data: [
      { tenantId, isDemo: true, title: 'Follow up with Al Noor Trading', priority: 'high', status: 'open', assigneeUserId: 'demo', assigneeName: 'You', assigneeRole: 'sales', linkedType: 'customer', dueDate: daysFromNow(1), createdByUserId: 'demo' },
      { tenantId, isDemo: true, title: 'Confirm greige delivery from Karur', priority: 'medium', status: 'in_progress', assigneeUserId: 'demo', assigneeName: 'You', assigneeRole: 'procurement', linkedType: 'order', dueDate: daysFromNow(3), createdByUserId: 'demo' },
      { tenantId, isDemo: true, title: 'Chase balance payment on INV-1001', priority: 'high', status: 'open', assigneeUserId: 'demo', assigneeName: 'You', assigneeRole: 'finance', linkedType: 'invoice', dueDate: daysFromNow(15), createdByUserId: 'demo' },
      { tenantId, isDemo: true, title: 'Book carrier for Dubai shipment', priority: 'medium', status: 'open', assigneeUserId: 'demo', assigneeName: 'You', assigneeRole: 'logistics', linkedType: 'order', dueDate: daysFromNow(5), createdByUserId: 'demo' },
    ],
  });

  // ── Compliance items (REAL, not demo — onboarding prompts) ──
  const complianceCount = await prisma.complianceItem.count({ where: { tenantId } });
  if (complianceCount === 0) {
    await prisma.complianceItem.createMany({
      data: pack.complianceSeeds.map((c) => ({
        tenantId, category: c.category, name: c.name, issuingAuthority: c.issuingAuthority, renewalLeadDays: c.renewalLeadDays,
      })),
    });
  }
}

/** Deletes every demo-flagged row for a tenant. Order matters only where FKs lack cascade; isDemo cascades handle children. */
export async function clearDemoData(tenantId: string) {
  const w = { tenantId, isDemo: true };
  await prisma.$transaction([
    prisma.invoice.deleteMany({ where: w }),
    prisma.costSheet.deleteMany({ where: w }),
    prisma.quote.deleteMany({ where: w }),
    prisma.order.deleteMany({ where: w }),
    prisma.task.deleteMany({ where: w }),
    prisma.vendor.deleteMany({ where: w }),
    prisma.lead.deleteMany({ where: w }),
  ]);
}
