import { config } from 'dotenv';
config({ path: '.env.local' });

/**
 * Bulk dummy-data seeder for manual UI testing (50+ records across every major module).
 * Targets the `demo` dev tenant — the same one prisma/seed.ts sets up and the app resolves
 * to on localhost. Idempotent per-run via a `BULK-<n>` numbering scheme; safe to re-run,
 * though re-running adds another batch rather than upserting (records are demo-flagged
 * so `clearDemoData` in the UI can wipe them in one sweep).
 *
 * Usage: npx tsx scripts/seed-bulk-demo.ts
 */
async function main() {
  const { prisma } = await import('../src/lib/prisma');
  const { DEV_TENANT_SLUG } = await import('../src/lib/tenant-resolver');

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    create: { slug: DEV_TENANT_SLUG, name: 'Demo Workspace', plan: 'free', status: 'trial' },
    update: {},
  });
  const tenantId = tenant.id;
  console.log(`Seeding bulk demo data into tenant: ${tenant.slug} (${tenantId})`);

  const now = Date.now();
  const daysFromNow = (d: number) => new Date(now + d * 86_400_000);
  const pick = <T,>(arr: readonly T[], i: number) => arr[i % arr.length];

  const countries = ['AE', 'GB', 'FR', 'DE', 'US', 'SA', 'IT', 'NL', 'AU', 'CA'];
  const companies = [
    'Al Noor Trading LLC', 'Maison du Linge', 'Coastal Hospitality Group', 'Nordic Home Textiles',
    'Riyadh Comfort Supplies', 'Milano Casa Linens', 'Rotterdam Hotel Group', 'Sydney Bay Resorts',
    'Toronto Suites Co.', 'Berlin Wohnen GmbH', 'Dubai Palm Hospitality', 'London Fine Linens',
    'Paris Textile Import', 'Munich Bettwaren', 'New York Hospitality Supply',
  ];
  const items = [
    'Cotton bath towels', 'Waffle bathrobes', 'Hotel bed linen sets', 'Terry hand towels',
    'Egyptian cotton sheets', 'Microfiber pillowcases', 'Poolside beach towels', 'Spa robes & wraps',
    'Duvet covers 300TC', 'Kitchen tea towels',
  ];
  const leadSources = ['whatsapp', 'inquiry', 'rfq', 'customer', 'manual', 'email'] as const;
  const leadStages = ['New', 'Quoted_Invoice', 'Follow_Up', 'Sample_Requested', 'In_Production', 'Shipped'] as const;
  const leadQualities = ['Strong', 'Medium', 'Weak', 'Unrated'] as const;

  // ── 15 leads ──────────────────────────────────────────────────────────────
  const leadNumbers = await prisma.lead.aggregate({ where: { tenantId }, _max: { leadNumber: true } });
  let nextLeadNumber = (leadNumbers._max.leadNumber ?? 2000) + 1;
  const leadRows = Array.from({ length: 15 }, (_, i) => ({
    tenantId,
    isDemo: true,
    source: pick(leadSources, i),
    name: `Contact ${nextLeadNumber + i}`,
    company: pick(companies, i),
    country: pick(countries, i),
    itemsInterested: pick(items, i),
    stage: pick(leadStages, i),
    quality: pick(leadQualities, i),
    leadNumber: nextLeadNumber + i,
    nextFollowUpAt: daysFromNow((i % 10) + 1),
  }));
  await prisma.lead.createMany({ data: leadRows }); // tenant-safe: every row in leadRows carries tenantId (built above)
  console.log(`✓ ${leadRows.length} leads`);

  // ── 8 buyers ──────────────────────────────────────────────────────────────
  const buyerRows = Array.from({ length: 8 }, (_, i) => ({
    tenantId,
    isDemo: true,
    name: pick(companies, i + 3),
    country: pick(countries, i + 2),
    currencyDefault: pick(['USD', 'EUR', 'GBP'], i),
    paymentTermsDefault: pick(['30% advance / 70% on BL', 'LC at sight', 'Net 30'], i),
    creditLimit: 10000 + i * 2500,
  }));
  await prisma.buyer.createMany({ data: buyerRows }); // tenant-safe: every row in buyerRows carries tenantId (built above)
  const buyers = await prisma.buyer.findMany({ where: { tenantId, isDemo: true }, orderBy: { createdAt: 'desc' }, take: 8 });
  console.log(`✓ ${buyerRows.length} buyers`);

  // ── 6 vendors + 12 vendor rates (2 each) ────────────────────────────────────
  const vendorNames = [
    'Karur Textile Mills', 'Erode Weaving Co.', 'Tirupur Knits Pvt Ltd', 'Panipat Home Textiles',
    'Coimbatore Cotton Corp', 'Solapur Terry Towels',
  ];
  const vendors = [];
  for (let i = 0; i < 6; i++) {
    const v = await prisma.vendor.create({
      data: {
        tenantId, isDemo: true, name: vendorNames[i],
        contactName: `Contact Person ${i + 1}`,
        email: `sales${i}@${vendorNames[i].toLowerCase().replace(/[^a-z]+/g, '')}.example`,
        phone: `+91 9${(800000000 + i * 111111).toString().slice(0, 9)}`,
      },
    });
    vendors.push(v);
  }
  const rateMethods = ['per_piece', 'per_kg', 'per_metre'] as const;
  const skus = ['TWL-BATH-500', 'ROBE-WAFFLE-M', 'BED-SET-QUEEN', 'TWL-HAND-400', 'SHEET-EGY-300TC', 'PILLOWCASE-MF'];
  let rateCount = 0;
  for (let i = 0; i < vendors.length; i++) {
    for (let j = 0; j < 2; j++) {
      await prisma.vendorRate.create({
        data: {
          tenantId, vendorId: vendors[i].id, sku: pick(skus, i + j), description: pick(items, i + j),
          method: pick(rateMethods, i + j), baseRate: parseFloat((2 + (i + j) * 0.7).toFixed(2)),
          normalizedPieceCost: parseFloat((2 + (i + j) * 0.7).toFixed(2)), moqPieces: 300 + (i + j) * 200,
          leadTimeDays: 20 + (i + j) * 3, isPreferred: j === 0,
        },
      });
      rateCount++;
    }
  }
  console.log(`✓ ${vendors.length} vendors, ${rateCount} vendor rates`);

  // ── 10 products ───────────────────────────────────────────────────────────
  const productRows = Array.from({ length: 10 }, (_, i) => ({
    tenantId, isDemo: true,
    sku: `SKU-BULK-${1000 + i}`,
    name: pick(items, i),
    description: `${pick(items, i)} — bulk demo product ${i + 1}`,
    uom: 'pcs',
    category: pick(['Bath', 'Bed', 'Kitchen', 'Spa'], i),
  }));
  await prisma.product.createMany({ data: productRows }); // tenant-safe: every row in productRows carries tenantId (built above)
  console.log(`✓ ${productRows.length} products`);

  // ── 8 quotes (with lines) ────────────────────────────────────────────────
  const quoteStatuses = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
  const quoteNumbers = await prisma.quote.count({ where: { tenantId } });
  let qNum = quoteNumbers + 2000;
  const quotes = [];
  for (let i = 0; i < 8; i++) {
    qNum++;
    const qty = 1000 + i * 500;
    const unitPrice = parseFloat((3 + i * 0.4).toFixed(2));
    const total = parseFloat((qty * unitPrice).toFixed(2));
    const q = await prisma.quote.create({
      data: {
        tenantId, isDemo: true, quoteNumber: `Q-BULK-${qNum}`, status: pick(quoteStatuses, i),
        currency: pick(['USD', 'EUR', 'GBP'], i), total, overallMarginPct: 15 + (i % 4) * 3,
        buyerId: buyers[i % buyers.length]?.id,
        lines: {
          create: [{
            description: pick(items, i), quantity: qty, cost: parseFloat((unitPrice * 0.75).toFixed(2)),
            expensePct: 6 + (i % 3), marginPct: 15 + (i % 4) * 3, unitPrice, lineTotal: total,
          }],
        },
      },
    });
    quotes.push(q);
  }
  console.log(`✓ ${quotes.length} quotes`);

  // ── 8 orders ──────────────────────────────────────────────────────────────
  const orderStatuses = ['confirmed', 'in_production', 'shipped', 'in_transit', 'delivered'] as const;
  const destPorts = ['AEJEA', 'GBFXT', 'FRLEH', 'DEHAM', 'USNYC', 'SAJED', 'ITGOA', 'NLRTM'];
  const orderNumbers = await prisma.order.count({ where: { tenantId } });
  let oNum = orderNumbers + 2000;
  const orders = [];
  for (let i = 0; i < 8; i++) {
    oNum++;
    const o = await prisma.order.create({
      data: {
        tenantId, isDemo: true, orderNumber: `SO-BULK-${oNum}`, status: pick(orderStatuses, i),
        buyerId: buyers[i % buyers.length]?.id,
        product: pick(items, i), quantity: 1000 + i * 400, unit: 'pcs', incoterm: pick(['FOB', 'CIF', 'DDP'], i),
        destination: pick(companies, i), originPort: 'INTUT', destPort: pick(destPorts, i),
      },
    });
    orders.push(o);
  }
  console.log(`✓ ${orders.length} orders`);

  // ── 8 invoices (with lines) ──────────────────────────────────────────────
  const invoiceStatuses = ['draft', 'sent', 'paid', 'partially_paid', 'overdue'] as const;
  const invoiceNumbers = await prisma.invoice.count({ where: { tenantId } });
  let iNum = invoiceNumbers + 2000;
  let invoiceCount = 0;
  for (let i = 0; i < 8; i++) {
    iNum++;
    const qty = 1000 + i * 300;
    const unitPrice = parseFloat((3.2 + i * 0.3).toFixed(2));
    const total = parseFloat((qty * unitPrice).toFixed(2));
    const status = pick(invoiceStatuses, i);
    const balanceDue = status === 'paid' ? 0 : status === 'partially_paid' ? parseFloat((total / 2).toFixed(2)) : total;
    await prisma.invoice.create({
      data: {
        tenantId, isDemo: true, invoiceNumber: `INV-BULK-${iNum}`, orderId: orders[i]?.id, status,
        currency: pick(['USD', 'EUR', 'GBP'], i), total, balanceDue,
        dueDate: status === 'overdue' ? daysFromNow(-(i + 1) * 3) : daysFromNow(15 + i * 2),
        lines: {
          create: [{
            description: pick(items, i), quantity: qty, cost: parseFloat((unitPrice * 0.75).toFixed(2)),
            expensePct: 6 + (i % 3), marginPct: 18 + (i % 3) * 2, unitPrice, lineTotal: total,
          }],
        },
      },
    });
    invoiceCount++;
  }
  console.log(`✓ ${invoiceCount} invoices`);

  // ── 10 tasks ──────────────────────────────────────────────────────────────
  const taskPriorities = ['low', 'medium', 'high'] as const;
  const taskStatuses = ['open', 'in_progress', 'done', 'cancelled'] as const;
  const taskLinkedTypes = ['order', 'customer', 'invoice', 'general'] as const;
  const taskRoles = ['sales', 'finance', 'procurement', 'production', 'logistics'] as const;
  const taskTitles = [
    'Follow up on quote', 'Chase balance payment', 'Confirm vendor delivery', 'Book carrier slot',
    'Send shipping docs', 'Update buyer on ETA', 'Review cost sheet margin', 'Renew compliance cert',
    'Reconcile bank realization', 'Prepare export documents',
  ];
  const taskRows = Array.from({ length: 10 }, (_, i) => ({
    tenantId, isDemo: true, title: taskTitles[i], priority: pick(taskPriorities, i), status: pick(taskStatuses, i),
    assigneeUserId: 'demo', assigneeName: 'You', assigneeRole: pick(taskRoles, i),
    linkedType: pick(taskLinkedTypes, i), dueDate: daysFromNow((i % 14) + 1), createdByUserId: 'demo',
  }));
  await prisma.task.createMany({ data: taskRows }); // tenant-safe: every row in taskRows carries tenantId (built above)
  console.log(`✓ ${taskRows.length} tasks`);

  const total = leadRows.length + buyerRows.length + vendors.length + rateCount + productRows.length
    + quotes.length + orders.length + invoiceCount + taskRows.length;
  console.log(`\n✓ Bulk seed complete: ${total} records added to tenant "${tenant.slug}".`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
