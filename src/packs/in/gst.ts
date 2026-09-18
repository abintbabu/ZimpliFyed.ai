/**
 * India export-invoice statutory helpers (EXPORT_OS_MASTER_PLAN §8.3/§15 Wave 1). Ported verbatim
 * from A/src/lib/gst-export.ts — the wording and place-of-supply logic are what the rules require
 * as read there; nothing here is tax advice, and the numbers still go past a CA before filing.
 *
 * Pure functions only, consumed by src/lib/doc-engine/models.ts (endorsement/place-of-supply on the
 * DocModel) and rules.ts (the LUT-validity finding). No jurisdiction branching lives in the
 * pack-neutral doc-engine core — this file is the single India-specific source of truth for it.
 */

// ── Rule 46 endorsement ──────────────────────────────────────────────────────

/**
 * CGST Rule 46 third proviso: an export-supply invoice must carry one of these two endorsements,
 * verbatim and in this form (ALL CAPS — not a styling choice). Which one applies decides whether
 * IGST was paid and therefore which refund route the shipment travels.
 */
export const LUT_ENDORSEMENT =
  'SUPPLY MEANT FOR EXPORT UNDER LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX';

export const IGST_PAID_ENDORSEMENT = 'SUPPLY MEANT FOR EXPORT ON PAYMENT OF INTEGRATED TAX';

/**
 * The endorsement an export document must print. Every doc type this pack builds
 * (proforma_invoice/commercial_invoice) is an export supply, so this never returns null — unlike
 * A's version, which also had to handle domestic tax invoices. Defaults to the "on payment of
 * integrated tax" wording when `underLut` is false: claiming an LUT that was not filed is the
 * worse of the two errors, so an unset/false flag must never read as "under LUT".
 */
export function resolveExportEndorsement(underLut: boolean): string {
  return underLut ? LUT_ENDORSEMENT : IGST_PAID_ENDORSEMENT;
}

// ── Place of supply ──────────────────────────────────────────────────────────

/**
 * IGST Act s.11(a): where goods are exported, the place of supply is the location outside India —
 * the destination country, not the exporter's own state. GSTR-1 reports that as code 96, "Other
 * Country".
 */
export function resolvePlaceOfSupply(destinationCountry: string): string {
  const country = destinationCountry.trim();
  return country ? `96-Other Country (${country})` : '96-Other Country';
}

// ── LUT validity ──────────────────────────────────────────────────────────────

/**
 * Whether the LUT claimed on a document is actually in force on `onDate`.
 *
 * An LUT runs for one financial year and has to be renewed. Printing the LUT endorsement under a
 * lapsed undertaking asserts a relief that did not exist on the date of supply — the sort of defect
 * found at assessment rather than at issue, by which point the shipment has long gone.
 *
 * Returns null when the question doesn't arise (not under LUT, or no validity date recorded); a
 * message when it does and the answer is no. `onDate`/`lutValidTo` are ISO `YYYY-MM-DD` strings —
 * a plain string comparison is the date comparison and sidesteps timezone drift entirely.
 */
export function lutValidityProblem(underLut: boolean, lutValidTo: string | null | undefined, onDate: string): string | null {
  if (!underLut || !lutValidTo) return null;
  return onDate > lutValidTo
    ? `The LUT on this document expired on ${lutValidTo}, before the document date of ${onDate}. Renew the LUT, or issue on payment of IGST.`
    : null;
}
