import 'server-only';
import type { Prisma } from '@prisma/client';
import { DOC_SERIES, type DocType } from './models';

/**
 * Per-tenant document numbering (DOC_ENGINE_SPEC §1.2). Produces `PI-2026-0042` style numbers with a
 * tx-safe increment: the counter row is upserted-and-incremented inside the same transaction the doc-set
 * is written in, so two concurrent generations can never mint the same number.
 */
export async function nextDocNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  type: DocType,
  year = new Date().getFullYear(),
): Promise<string> {
  const series = DOC_SERIES[type];
  // Atomic: create the counter at 2 (reserving 1) or increment an existing one, returning the value used.
  const counter = await tx.docCounter.upsert({
    where: { tenantId_series_year: { tenantId, series, year } },
    create: { tenantId, series, year, next: 2 },
    update: { next: { increment: 1 } },
    select: { next: true },
  });
  // On create we reserved 1; on update `next` is the just-incremented value, so the number in use is next-1.
  const value = counter.next - 1;
  return `${series}-${year}-${String(value).padStart(4, '0')}`;
}
