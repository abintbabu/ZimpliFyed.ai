import 'server-only';
import type { Prisma, NumberingFiscalYearMode } from '@prisma/client';
import { DOC_SERIES, type DocType } from './models';

/**
 * Per-tenant document numbering (EXPORT_OS_MASTER_PLAN §15 Wave 1, §7 Migration C). Supersedes the
 * old `DocCounter`-based `nextDocNumber` — this is a clean cutover, not a dual-read shim, since
 * `DocCounter` had exactly one caller (this file) and nothing else in the app reads it. `DocCounter`
 * itself stays in the schema unused (contract step deferred per docs/EXPAND_CONTRACT_MIGRATIONS.md).
 *
 * Called ONLY from src/lib/doc-engine/issue.ts's issueDocSet — never at draft-generation time. A
 * number is minted exactly once, inside the same transaction that flips a DocSet from draft to
 * approved, in issue order. Any tenant with existing DocCounter-numbered documents needs
 * scripts/backfill-numbering-series.ts run once before this ships, so a fresh NumberingCounter can
 * never re-emit a number already on a filed document.
 */

const ALLOWED_NUMBER_CHARS = /^[A-Za-z0-9/-]+$/;

/** Length at which a serial stops being GST Rule 46(b) compliant. Flagged, not enforced — the
 * readable house format (PREFIX-FY-NNNN) is kept deliberately, matching Anabyn's owner-approved
 * choice; a long serial may be rejected by GSTR-1 Table 6A at filing time, surfaced as a Finding. */
const RULE_46B_MAX_LENGTH = 16;

export type NumberingResult = { docNumber: string; overLength: boolean };

/**
 * Indian fiscal year (1 Apr – 31 Mar), e.g. "2025-26". A date of 2026-03-31 is FY "2025-26";
 * 2026-04-01 is FY "2026-27". Calendar mode is the plain 4-digit year; `none` is a constant period
 * (a series that never rolls over).
 */
export function resolvePeriodKey(mode: NumberingFiscalYearMode, date: Date): string {
  switch (mode) {
    case 'india_fy': {
      const year = date.getFullYear();
      const startYear = date.getMonth() >= 3 ? year : year - 1; // months are 0-indexed; 3 === April
      const two = (y: number) => String(y % 100).padStart(2, '0');
      return `${startYear}-${two(startYear + 1)}`;
    }
    case 'calendar':
      return String(date.getFullYear());
    case 'none':
      return 'all';
  }
}

/** No settings UI exists yet to configure a series, so one is auto-provisioned on first use with
 * sensible defaults — this replaces manual series setup for Wave 1. Read-only after creation here;
 * an existing series's declaredFloor (settable once a settings UI exists) is always respected. */
async function ensureSeries(tx: Prisma.TransactionClient, tenantId: string, type: DocType, packId: string) {
  const key = DOC_SERIES[type];
  const fiscalYearMode: NumberingFiscalYearMode = packId === 'in' ? 'india_fy' : 'calendar';
  return tx.numberingSeries.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, prefix: key, fiscalYearMode, padWidth: 4, separator: '-', declaredFloor: 0 },
    update: {},
  });
}

/**
 * Allocates the next number for `type`, tx-safe. Must run inside the caller's own transaction (the
 * issue transaction), same contract the old nextDocNumber had.
 *
 * Concurrency: the counter is incremented atomically (`next: { increment: 1 }`), which Postgres
 * guarantees serializes concurrent transactions on the same row — deliberately NOT a read-then-write
 * upsert with an empty update, which Prisma/some adapters can optimize into a plain SELECT and lose
 * the row lock that makes this collision-free.
 *
 * Declared floor is re-applied on every issue (§13.1): if it has moved ahead of the counter, the
 * counter is corrected forward in the same transaction so it never lags behind again — a floor only
 * ever moves the run forward, never re-emits a number.
 */
export async function issueDocNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  type: DocType,
  packId: string,
  issuedAt: Date = new Date(),
): Promise<NumberingResult> {
  const series = await ensureSeries(tx, tenantId, type, packId);
  const periodKey = resolvePeriodKey(series.fiscalYearMode, issuedAt);

  const counter = await tx.numberingCounter.upsert({
    where: { seriesId_periodKey: { seriesId: series.id, periodKey } },
    create: { seriesId: series.id, periodKey, next: 2 }, // reserves 1
    update: { next: { increment: 1 } },
    select: { id: true, next: true },
  });
  // On create `next` starts reserved at 2 (value in use: 1); on update `next` is post-increment, so
  // the value just reserved is next-1 either way.
  const rawSerial = counter.next - 1;
  const serial = Math.max(rawSerial, series.declaredFloor);
  if (serial !== rawSerial) {
    await tx.numberingCounter.update({ where: { id: counter.id }, data: { next: serial + 1 } });
  }

  const padded = String(serial).padStart(series.padWidth, '0');
  const docNumber = `${series.prefix}${series.separator}${periodKey}${series.separator}${padded}`;
  if (!ALLOWED_NUMBER_CHARS.test(docNumber)) {
    throw new Error(`Document number "${docNumber}" contains characters GST Rule 46(b) does not permit (alphanumerics, "/" and "-" only).`);
  }
  return { docNumber, overLength: docNumber.length > RULE_46B_MAX_LENGTH };
}
