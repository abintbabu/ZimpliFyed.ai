import { prisma } from '../src/lib/prisma';

/**
 * M1 backfill (expand→backfill phase): copies each legacy order's quote lines into OrderLineItem and
 * stamps Order.currency from the quote. Idempotent — orders that already have lines are skipped — and
 * `--dry-run` reports without writing. Run after `db:push` of the order-line schema.
 */
async function main() {
  const dry = process.argv.includes('--dry-run');
  // tenant-safe: one-off backfill script — processes every tenant's legacy orders by design
  const orders = await prisma.order.findMany({
    where: { lines: { none: {} }, quote: { isNot: null } },
    include: { quote: { include: { lines: true } } },
  });

  let migrated = 0;
  for (const o of orders) {
    const q = o.quote;
    if (!q || q.lines.length === 0) continue;
    if (!dry) {
      await prisma.$transaction([
        prisma.orderLineItem.createMany({
          data: q.lines.map((l, i) => ({
            orderId: o.id,
            productId: l.productId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            sortOrder: i,
          })),
        }),
        // tenant-safe: updates the order row just read above, addressed by its own primary key
        prisma.order.update({ where: { id: o.id }, data: { currency: o.currency ?? q.currency } }),
      ]);
    }
    migrated++;
  }
  console.log(`${dry ? '[dry-run] would backfill' : 'Backfilled'} ${migrated} order(s) of ${orders.length} candidate(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
