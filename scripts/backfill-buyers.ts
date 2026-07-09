/**
 * One-off backfill: promotes the free-text buyer identity trapped in
 * ExportDocument snapshots (and Lead.company for lead-sourced orders) into
 * real Buyer rows, then links Order.buyerId / Quote.buyerId to them.
 *
 * Matching is exact-name (case-insensitive, trimmed) per tenant — no fuzzy
 * dedupe. Run with:
 *   DIRECT=$(grep -o 'DIRECT_URL="[^"]*"' .env.local | sed 's/DIRECT_URL=//;s/"//g')
 *   DATABASE_URL="$DIRECT" npx tsx scripts/backfill-buyers.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { ExportDocumentData } from '../src/lib/export-documents';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const dryRun = process.argv.includes('--dry-run');

async function resolveBuyerName(order: {
  id: string;
  tenantId: string;
  quote: { leadId: string | null } | null;
}): Promise<{ name: string; address?: string } | null> {
  const latestDoc = await prisma.exportDocument.findFirst({
    where: { tenantId: order.tenantId, orderId: order.id },
    orderBy: { createdAt: 'desc' },
  });
  if (latestDoc) {
    const data = latestDoc.data as unknown as ExportDocumentData;
    if (data.buyerName?.trim()) return { name: data.buyerName.trim(), address: data.buyerAddress?.trim() };
  }
  if (order.quote?.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: order.quote.leadId } });
    if (lead?.company?.trim()) return { name: lead.company.trim() };
    if (lead?.name?.trim()) return { name: lead.name.trim() };
  }
  return null;
}

async function main() {
  const orders = await prisma.order.findMany({
    where: { buyerId: null },
    include: { quote: true },
  });

  console.log(`${orders.length} order(s) without a buyer link.`);

  // name.toLowerCase() -> Buyer.id, scoped per tenant
  const buyerCache = new Map<string, string>();

  let created = 0;
  let linked = 0;

  for (const order of orders) {
    const resolved = await resolveBuyerName(order);
    if (!resolved) {
      console.log(`  skip ${order.orderNumber}: no buyer name found in export docs or lead`);
      continue;
    }

    const cacheKey = `${order.tenantId}:${resolved.name.toLowerCase()}`;
    let buyerId = buyerCache.get(cacheKey);

    if (!buyerId) {
      const existing = await prisma.buyer.findFirst({
        where: { tenantId: order.tenantId, name: { equals: resolved.name, mode: 'insensitive' } },
      });
      if (existing) {
        buyerId = existing.id;
      } else {
        console.log(`  ${dryRun ? '[dry-run] would create' : 'creating'} buyer "${resolved.name}" (tenant ${order.tenantId})`);
        if (!dryRun) {
          const buyer = await prisma.buyer.create({
            data: {
              tenantId: order.tenantId,
              name: resolved.name,
              address: resolved.address || null,
              source: 'backfill',
            },
          });
          buyerId = buyer.id;
        } else {
          buyerId = 'dry-run-placeholder';
        }
        created += 1;
      }
      buyerCache.set(cacheKey, buyerId);
    }

    console.log(`  ${dryRun ? '[dry-run] would link' : 'linking'} order ${order.orderNumber} -> buyer "${resolved.name}"`);
    if (!dryRun) {
      await prisma.order.update({ where: { id: order.id }, data: { buyerId } });
      if (order.quote) {
        await prisma.quote.update({ where: { id: order.quote.id }, data: { buyerId } });
      }
    }
    linked += 1;
  }

  console.log(`\nDone. ${created} buyer(s) created, ${linked} order(s) linked.${dryRun ? ' (dry run — nothing written)' : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
