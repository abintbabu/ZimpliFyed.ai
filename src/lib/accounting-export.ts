// Accountant exports (V3). Pure — no DB. The product keeps the general ledger out of scope ("keep Tally, we sync
// to it"), so the bridge is a file the accountant imports: a flat CSV that works with anything, and Tally
// voucher XML. THE TALLY XML HAS NOT BEEN IMPORTED INTO A REAL TALLY COMPANY — ledger names must already exist
// there, and the import should be tried on a test company first.

import { signedInvoiceTotal, effectiveNoteKind, type NoteKind } from './invoice-notes';
import { convertToBase, type FxRateMap } from './fx';

export type ExportInvoice = {
  invoiceNumber: string; createdAt: Date; dueDate: Date | null; currency: string; total: number; status: string;
  isCreditOrDebitNote: boolean; noteKind?: NoteKind | null; buyerName: string | null;
};
export type ExportBill = { billNumber: string; billDate: Date; currency: string; total: number; status: string; vendorName: string };

/** CSV with RFC 4180 quoting, and protection against spreadsheet formula injection (leading = + - @). */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function accountantCsv(invoices: ExportInvoice[], bills: ExportBill[]): string {
  const head = ['Type', 'Number', 'Date', 'Due date', 'Party', 'Currency', 'Amount (signed)', 'Status'];
  const rows: (string | number | null)[][] = [];
  for (const i of invoices) {
    if (i.status === 'draft' || i.status === 'void') continue;
    const kind = effectiveNoteKind(i);
    rows.push([kind === 'credit' ? 'Credit note' : kind === 'debit' ? 'Debit note' : 'Sales invoice', i.invoiceNumber, iso(i.createdAt), i.dueDate ? iso(i.dueDate) : '', i.buyerName ?? '', i.currency, signedInvoiceTotal(i).toFixed(2), i.status]);
  }
  for (const b of bills) {
    if (b.status === 'void') continue;
    rows.push(['Purchase bill', b.billNumber, iso(b.billDate), '', b.vendorName, b.currency, (-b.total).toFixed(2), b.status]);
  }
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
   // XML 1.0 forbids most control characters — strip rather than emit a file Tally rejects.
   .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const tallyDate = (d: Date) => iso(d).replace(/-/g, '');

export type TallyOptions = {
  company: string;
  baseCurrency: string;
  rates: FxRateMap;
  salesLedger?: string;
  purchaseLedger?: string;
};

export type TallyResult = { xml: string; exported: number; skipped: { number: string; reason: string }[] };

type Voucher = { type: 'Sales' | 'Credit Note' | 'Debit Note' | 'Purchase'; number: string; date: Date; party: string; baseAmount: number; narration: string };

function entry(ledger: string, amount: number, deemedPositive: boolean): string {
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemedPositive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amount.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
}

/**
 * Voucher XML for invoices, notes and bills, in the BASE currency. Foreign-currency documents are converted at
 * the saved rate; one with no rate is skipped and reported — a voucher at a guessed rate would misstate the books.
 */
export function tallyVouchersXml(invoices: ExportInvoice[], bills: ExportBill[], opt: TallyOptions): TallyResult {
  const skipped: TallyResult['skipped'] = [];
  const vouchers: Voucher[] = [];
  const toBase = (amount: number, currency: string, number: string) => {
    const v = currency.toUpperCase() === opt.baseCurrency.toUpperCase() ? amount : convertToBase(amount, currency, opt.rates);
    if (v == null) skipped.push({ number, reason: `No exchange rate for ${currency.toUpperCase()}` });
    return v;
  };

  for (const i of invoices) {
    if (i.status === 'draft' || i.status === 'void') continue;
    if (!i.buyerName) { skipped.push({ number: i.invoiceNumber, reason: 'No buyer — Tally needs a party ledger' }); continue; }
    const amt = toBase(Math.abs(i.total), i.currency, i.invoiceNumber);
    if (amt == null) continue;
    const kind = effectiveNoteKind(i);
    vouchers.push({ type: kind === 'credit' ? 'Credit Note' : kind === 'debit' ? 'Debit Note' : 'Sales', number: i.invoiceNumber, date: i.createdAt, party: i.buyerName, baseAmount: amt, narration: `${i.currency.toUpperCase()} ${Math.abs(i.total).toFixed(2)}` });
  }
  for (const b of bills) {
    if (b.status === 'void') continue;
    const amt = toBase(b.total, b.currency, b.billNumber);
    if (amt == null) continue;
    vouchers.push({ type: 'Purchase', number: b.billNumber, date: b.billDate, party: b.vendorName, baseAmount: amt, narration: `${b.currency.toUpperCase()} ${b.total.toFixed(2)}` });
  }

  const salesLedger = opt.salesLedger ?? 'Export Sales';
  const purchaseLedger = opt.purchaseLedger ?? 'Purchases';
  const body = vouchers.map((v) => {
    // Tally sign convention: the debit side is "deemed positive" with a NEGATIVE amount.
    // Sales / Debit Note: party debited, income credited. Credit Note / Purchase: the reverse.
    const partyDebit = v.type === 'Sales' || v.type === 'Debit Note';
    const other = v.type === 'Purchase' ? purchaseLedger : salesLedger;
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${v.type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${tallyDate(v.date)}</DATE><VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xmlEscape(v.number)}</VOUCHERNUMBER><PARTYLEDGERNAME>${xmlEscape(v.party)}</PARTYLEDGERNAME><NARRATION>${xmlEscape(v.narration)}</NARRATION>${entry(v.party, partyDebit ? -v.baseAmount : v.baseAmount, partyDebit)}${entry(other, partyDebit ? v.baseAmount : -v.baseAmount, !partyDebit)}</VOUCHER></TALLYMESSAGE>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(opt.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${body}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
  return { xml, exported: vouchers.length, skipped };
}
