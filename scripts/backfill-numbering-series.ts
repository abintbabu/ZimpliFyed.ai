import { prisma } from "../src/lib/prisma";
import { resolvePeriodKey } from "../src/lib/doc-engine/numbering";
import type { NumberingFiscalYearMode } from "@prisma/client";

/**
 * One-off: seeds NumberingSeries + NumberingCounter past every existing DocCounter row, so the new
 * issue-transaction numbering (src/lib/doc-engine/numbering.ts) can never re-emit a document number
 * that's already on a filed document. Mirrors Anabyn's seedSeriesCounterIfMissing/declaredSeriesFloor
 * pattern (EXPORT_OS_MASTER_PLAN §14). Run once, before Wave 1 ships to any tenant with existing
 * DocCounter-numbered documents — a no-op on a fresh tenant with no DocCounter rows.
 *
 * DocCounter is keyed by a plain calendar year; NumberingSeries's periodKey may instead be an Indian
 * fiscal-year label. A DocCounter year doesn't map to exactly one fiscal-year period (documents from
 * Jan-Mar of that year actually belong to the PRIOR fiscal year under india_fy), so this seeds BOTH
 * plausible periods (mid-Jan and mid-Dec of the DocCounter year) to the same floor, for safety —
 * over-seeding wastes a handful of numbers at the seam at worst; under-seeding risks a collision,
 * which is the one outcome this script exists to prevent.
 *
 * Idempotent: re-running only ever raises a counter (`Math.max` against what's already there), never
 * lowers one.
 *
 * Run: npx tsx --conditions=react-server scripts/backfill-numbering-series.ts [tenantSlug]
 */
async function main() {
  const tenantSlug = process.argv[2];
  // tenant-safe: one-off backfill script — processes every tenant's DocCounter rows by design (optionally scoped to one tenant via argv above)
  const counters = await prisma.docCounter.findMany({
    where: tenantSlug ? { tenant: { slug: tenantSlug } } : undefined,
    include: { tenant: { select: { id: true, slug: true, packId: true } } },
  });

  if (counters.length === 0) {
    console.log(
      tenantSlug
        ? `No DocCounter rows for tenant "${tenantSlug}" — nothing to backfill.`
        : "No DocCounter rows anywhere — nothing to backfill.",
    );
    return;
  }

  for (const dc of counters) {
    const fiscalYearMode: NumberingFiscalYearMode = dc.tenant.packId === "in" ? "india_fy" : "calendar";

    const series = await prisma.numberingSeries.upsert({
      where: { tenantId_key: { tenantId: dc.tenantId, key: dc.series } },
      create: {
        tenantId: dc.tenantId,
        key: dc.series,
        prefix: dc.series,
        fiscalYearMode,
        padWidth: 4,
        separator: "-",
        declaredFloor: 0,
      },
      update: {},
    });

    const candidateDates = [new Date(dc.year, 0, 15), new Date(dc.year, 11, 15)]; // mid-Jan, mid-Dec of that calendar year
    const periodKeys = [...new Set(candidateDates.map((d) => resolvePeriodKey(series.fiscalYearMode, d)))];

    for (const periodKey of periodKeys) {
      const existing = await prisma.numberingCounter.findUnique({
        where: { seriesId_periodKey: { seriesId: series.id, periodKey } },
      });
      const floor = Math.max(dc.next, existing?.next ?? 0);
      await prisma.numberingCounter.upsert({
        where: { seriesId_periodKey: { seriesId: series.id, periodKey } },
        create: { seriesId: series.id, periodKey, next: floor },
        update: { next: floor },
      });
      console.log(
        `${dc.tenant.slug}: ${dc.series} period "${periodKey}" counter set to ${floor} (from DocCounter ${dc.series}-${dc.year}, next=${dc.next})`,
      );
    }
  }

  console.log(`Backfilled ${counters.length} DocCounter row(s) into NumberingSeries/NumberingCounter.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
