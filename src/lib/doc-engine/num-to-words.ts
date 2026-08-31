/**
 * Amount → words, for the "Total in words" line every commercial invoice carries.
 *
 * Ported from anabyn-website's `invoice-pdf.tsx` (the only pure function in that 1,936-line component).
 * Uses the Indian numbering system — Lakh and Crore rather than Million and Billion — because that is
 * what an Indian exporter's customs and bank documents are read against.
 *
 * Pure and dependency-free: the doc-engine's golden harness pins document output, so anything a
 * DocModel builder calls must be deterministic.
 */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–999 → words. */
function chunk(num: number): string {
  if (num < 20) return ONES[num];
  if (num < 100) return TENS[Math.floor(num / 10)] + (num % 10 ? ` ${ONES[num % 10]}` : '');
  return `${ONES[Math.floor(num / 100)]} Hundred` + (num % 100 ? ` ${chunk(num % 100)}` : '');
}

/** Whole number → words, grouped as thousand / lakh / crore. */
function convert(num: number): string {
  if (num < 1000) return chunk(num);
  if (num < 100_000) return `${convert(Math.floor(num / 1000))} Thousand` + (num % 1000 ? ` ${chunk(num % 1000)}` : '');
  if (num < 10_000_000) return `${convert(Math.floor(num / 100_000))} Lakh` + (num % 100_000 ? ` ${convert(num % 100_000)}` : '');
  return `${convert(Math.floor(num / 10_000_000))} Crore` + (num % 10_000_000 ? ` ${convert(num % 10_000_000)}` : '');
}

/**
 * `amountInWords(1234.5, 'USD')` → `"One Thousand Two Hundred Thirty Four and Fifty Cents Only"`.
 *
 * The subunit is named per currency (Paise for INR, Cents otherwise) and omitted when the amount is
 * whole. Negative amounts are prefixed "Minus" — credit notes need them.
 */
export function amountInWords(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '—';

  const negative = amount < 0;
  const abs = Math.abs(amount);

  const intPart = Math.floor(abs);
  // Round the fraction to 2dp the same way the money formatter does, so the words and the figure agree.
  let subunits = Math.round((abs - intPart) * 100);
  let whole = intPart;
  if (subunits === 100) {
    whole += 1;
    subunits = 0;
  }

  if (whole === 0 && subunits === 0) return `Zero ${currency} Only`;

  const subunitLabel = currency.toUpperCase() === 'INR' ? 'Paise' : 'Cents';
  let words = whole === 0 ? 'Zero' : convert(whole);
  if (subunits > 0) words += ` and ${chunk(subunits)} ${subunitLabel}`;

  return `${negative ? 'Minus ' : ''}${words} Only`;
}
