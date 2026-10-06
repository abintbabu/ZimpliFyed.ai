/**
 * Working-document numbers for drafts created by one-click conversions (quote / order / invoice).
 * These are labels, not statutory serials: gapless serials are allocated only inside the issue
 * transaction (see doc-engine/numbering.ts). Pure so the format and the collision walk are testable.
 */

export type DocNumberPrefix = 'QT' | 'ORD' | 'INV' | 'SHP' | 'PO' | 'GRN' | 'BILL' | 'IMP' | 'RUN' | 'QC';

export function formatDocNumber(prefix: DocNumberPrefix, seq: number, now: Date): string {
  return `${prefix}-${now.getFullYear()}-${String(seq).padStart(4, '0')}`;
}

/** Starting at `startSeq`, return the first number `exists` reports as unused. */
export async function pickFreeDocNumber(
  prefix: DocNumberPrefix,
  startSeq: number,
  now: Date,
  exists: (docNumber: string) => Promise<boolean>,
  maxAttempts = 50,
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = formatDocNumber(prefix, startSeq + i, now);
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error(`Could not allocate a free ${prefix} number`);
}
