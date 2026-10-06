// Credit vs debit notes (M10). Pure — no DB.
//
// `Invoice.isCreditOrDebitNote` could not say which kind a note was, so every consumer guessed: GST prep
// subtracted all notes (a debit note would have REDUCED turnover) while order P&L ignored them entirely.
// `noteKind` is the typed replacement; this file is the single place that turns an invoice into a signed
// amount, so those consumers cannot drift apart again. Legacy rows (flag set, no kind) are treated as credit
// notes — the behaviour GST prep already had — until they are backfilled.

export type NoteKind = 'credit' | 'debit';

export type NoteLike = { isCreditOrDebitNote: boolean; noteKind?: NoteKind | null };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The note's kind, or null for an ordinary invoice. Legacy untyped notes resolve to 'credit'. */
export function effectiveNoteKind(inv: NoteLike): NoteKind | null {
  if (inv.noteKind) return inv.noteKind;
  return inv.isCreditOrDebitNote ? 'credit' : null;
}

/** True for a flagged note that has no typed kind yet (needs the backfill / a human decision). */
export function isLegacyUntypedNote(inv: NoteLike): boolean {
  return inv.isCreditOrDebitNote && !inv.noteKind;
}

/** Invoice and debit note add to turnover; credit note subtracts. */
export function signedInvoiceTotal(inv: NoteLike & { total: number }): number {
  const amount = Math.abs(inv.total);
  return effectiveNoteKind(inv) === 'credit' ? -amount : amount;
}

export type NoteValidationInput = {
  kind: NoteKind;
  reason: string;
  noteTotal: number;
  noteCurrency: string;
  original: { total: number; currency: string; isNote: boolean } | null;
  /** Sum of credit notes already issued against the original. */
  priorCreditsOnOriginal: number;
};

/** Returns the first problem with a proposed note, or null when it is acceptable. */
export function validateNote(i: NoteValidationInput): string | null {
  if (!i.reason.trim()) return `A ${i.kind} note needs a reason.`;
  if (!(i.noteTotal > 0)) return `A ${i.kind} note must have a total above 0.`;
  if (i.kind === 'credit' && !i.original) return 'A credit note must reference the invoice it credits.';
  if (!i.original) return null;
  if (i.original.isNote) return 'A note cannot be raised against another credit/debit note.';
  if (i.original.currency.toUpperCase() !== i.noteCurrency.toUpperCase()) {
    return `The note is in ${i.noteCurrency.toUpperCase()} but the invoice is in ${i.original.currency.toUpperCase()}.`;
  }
  if (i.kind === 'credit') {
    const remaining = round2(i.original.total - i.priorCreditsOnOriginal);
    if (i.noteTotal > remaining + 0.005) {
      return `This credit (${round2(i.noteTotal)}) exceeds what can still be credited on the invoice (${remaining}).`;
    }
  }
  return null;
}

/**
 * The one rule for what a buyer still owes on an invoice: total, less money realised from the bank, less credit
 * notes raised against it. Both the bank-realisation sync and credit-note creation must agree on this — if either
 * recomputed it differently, recording a payment would silently undo a credit (or the reverse).
 */
export function derivedInvoiceBalance(input: { total: number; realized: number; credited: number }): { balanceDue: number; settledAmount: number; paid: boolean } {
  const settledAmount = round2(input.realized + input.credited);
  const balanceDue = Math.max(0, round2(input.total - settledAmount));
  return { balanceDue, settledAmount, paid: balanceDue <= 0.01 };
}

/** An invoice's open balance after a credit note is applied; never below zero. */
export function balanceAfterCredit(balanceDue: number, creditTotal: number): number {
  return Math.max(0, round2(balanceDue - creditTotal));
}
