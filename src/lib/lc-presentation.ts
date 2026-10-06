// LC document checklist and presentation pre-check (V2). Pure — no DB, no clock.
//
// The most common reasons a bank refuses documents under a letter of credit are mechanical: shipped after the
// latest shipment date, presented after the window closed, an invoice above the LC amount or in another
// currency, a required document simply not in the set. All of that is checkable BEFORE presentation. This does
// not read the LC's free text for subtler conditions (that is the AI extraction's job) and it is not the bank's
// determination — the issuing/nominated bank decides.

export type DocKind =
  | 'commercial_invoice' | 'packing_list' | 'certificate_of_origin' | 'bill_of_lading' | 'airway_bill'
  | 'insurance_certificate' | 'inspection_certificate' | 'phytosanitary_certificate' | 'fumigation_certificate'
  | 'proforma_invoice' | 'beneficiary_certificate' | 'draft' | 'other';

const RULES: [DocKind, RegExp][] = [
  // Order matters: more specific phrases before generic ones.
  ['proforma_invoice', /pro[-\s]?forma/i],
  ['commercial_invoice', /commercial\s+invoice|signed\s+invoice|\binvoice\b/i],
  ['packing_list', /packing\s+list|weight\s+(list|note)|packing\s+and\s+weight/i],
  ['certificate_of_origin', /certificate\s+of\s+origin|\bgsp\b|form\s*a\b|\bco\b\s+(issued|certif)|origin\s+certificate/i],
  ['airway_bill', /air\s*way\s*bill|\bawb\b|air\s+waybill/i],
  ['bill_of_lading', /bill\s+of\s+lading|\bb\/?l\b|ocean\s+bill|sea\s*way\s*bill|full\s+set/i],
  ['insurance_certificate', /insurance\s+(policy|certificate)|certificate\s+of\s+insurance/i],
  ['phytosanitary_certificate', /phyto/i],
  ['fumigation_certificate', /fumigation/i],
  ['inspection_certificate', /inspection|quality\s+certificate|certificate\s+of\s+quality|pre[-\s]?shipment/i],
  ['beneficiary_certificate', /beneficiary'?s?\s+(certificate|statement)/i],
  ['draft', /\bdraft\b|bill\s+of\s+exchange/i],
];

/** Maps one LC "documents required" line to the document kind it asks for. Unrecognised → 'other'. */
export function classifyRequiredDocument(text: string): DocKind {
  for (const [kind, re] of RULES) if (re.test(text)) return kind;
  return 'other';
}

/** Guesses the document kind of an uploaded file from its name — used only to mark "we have something". */
export function kindFromFileName(name: string): DocKind | null {
  const n = name.toLowerCase().replace(/[_\-.]+/g, ' ');
  for (const [kind, re] of RULES) if (kind !== 'draft' && re.test(n)) return kind;
  return null;
}

export type ChecklistItem = { text: string; kind: DocKind; status: 'ready' | 'missing' | 'manual' };

/**
 * Required documents against what exists. 'manual' = we cannot tell (an unrecognised requirement) — it needs a
 * human tick, and is never reported as satisfied.
 */
export function buildChecklist(required: string[], available: Set<DocKind>): ChecklistItem[] {
  return required.filter((t) => t.trim()).map((text) => {
    const kind = classifyRequiredDocument(text);
    if (kind === 'other') return { text, kind, status: 'manual' as const };
    // A B/L requirement is also met by an air waybill for air shipments, and vice-versa is NOT assumed.
    const ok = available.has(kind);
    return { text, kind, status: ok ? ('ready' as const) : ('missing' as const) };
  });
}

export const DEFAULT_PRESENTATION_DAYS = 21; // UCP 600 art. 14(c) unless the LC states otherwise

const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export type PresentationFinding = { severity: 'error' | 'warning' | 'ok'; code: string; message: string };

export type PresentationCheck = {
  ready: boolean;
  findings: PresentationFinding[];
  /** The last day documents can be presented: shipment date + window, capped at LC expiry. */
  presentationDeadline: Date | null;
  daysLeft: number | null;
};

export function checkPresentation(input: {
  lc: { amount: number | null; currency: string | null; expiryDate: Date | null; latestShipmentDate: Date | null; status: string };
  /** Date goods were shipped (bill of lading / on-board date). Null if not shipped yet. */
  shipmentDate: Date | null;
  invoiceTotal: number | null;
  invoiceCurrency: string | null;
  checklist: ChecklistItem[];
  now: Date;
  presentationDays?: number;
  /** Fractional tolerance on the LC amount, e.g. 0.1 when the LC says "about". Default 0. */
  amountTolerance?: number;
}): PresentationCheck {
  const f: PresentationFinding[] = [];
  const err = (code: string, message: string) => f.push({ severity: 'error', code, message });
  const warn = (code: string, message: string) => f.push({ severity: 'warning', code, message });
  const { lc } = input;
  const days = input.presentationDays ?? DEFAULT_PRESENTATION_DAYS;

  if (['expired', 'cancelled', 'paid'].includes(lc.status)) err('lc_status', `The LC is ${lc.status} — nothing can be presented under it.`);

  if (!input.shipmentDate) warn('not_shipped', 'No shipment date recorded yet — the shipping-date and presentation-window checks cannot run.');
  if (input.shipmentDate && lc.latestShipmentDate && utcDay(input.shipmentDate) > utcDay(lc.latestShipmentDate)) {
    const late = Math.round((utcDay(input.shipmentDate) - utcDay(lc.latestShipmentDate)) / DAY);
    err('late_shipment', `Shipped ${late} day(s) after the latest shipment date (${lc.latestShipmentDate.toISOString().slice(0, 10)}). The documents will be discrepant — seek an amendment.`);
  }

  let presentationDeadline: Date | null = null;
  if (input.shipmentDate) {
    presentationDeadline = new Date(utcDay(input.shipmentDate) + days * DAY);
    if (lc.expiryDate && utcDay(lc.expiryDate) < utcDay(presentationDeadline)) presentationDeadline = new Date(utcDay(lc.expiryDate));
  } else if (lc.expiryDate) presentationDeadline = new Date(utcDay(lc.expiryDate));
  const daysLeft = presentationDeadline ? Math.round((utcDay(presentationDeadline) - utcDay(input.now)) / DAY) : null;
  if (daysLeft != null && daysLeft < 0) err('window_closed', `The presentation window closed ${-daysLeft} day(s) ago (${presentationDeadline!.toISOString().slice(0, 10)}).`);
  else if (daysLeft != null && daysLeft <= 5) warn('window_closing', `Only ${daysLeft} day(s) left to present documents.`);

  if (lc.amount != null && lc.currency && input.invoiceTotal != null && input.invoiceCurrency) {
    if (lc.currency.toUpperCase() !== input.invoiceCurrency.toUpperCase()) err('currency_mismatch', `The invoice is in ${input.invoiceCurrency.toUpperCase()} but the LC is in ${lc.currency.toUpperCase()}.`);
    else if (input.invoiceTotal > lc.amount * (1 + (input.amountTolerance ?? 0)) + 0.005) err('over_amount', `The invoice (${input.invoiceTotal}) exceeds the LC amount (${lc.amount}).`);
    else if (input.invoiceTotal < lc.amount * 0.5) warn('low_utilisation', `The invoice uses under half of the LC (${input.invoiceTotal} of ${lc.amount}).`);
  } else if (lc.amount == null) warn('no_amount', 'The LC amount is not recorded, so the invoice amount cannot be checked against it.');

  for (const item of input.checklist) {
    if (item.status === 'missing') err('missing_document', `Required document not in the set: ${item.text}`);
    else if (item.status === 'manual') warn('manual_check', `Check by hand (not recognised): ${item.text}`);
  }
  if (input.checklist.length === 0) warn('no_checklist', 'No required documents are recorded for this LC.');

  const ready = !f.some((x) => x.severity === 'error');
  if (ready && f.length === 0) f.push({ severity: 'ok', code: 'all_clear', message: 'No mechanical discrepancies found.' });
  return { ready, findings: f, presentationDeadline, daysLeft };
}
