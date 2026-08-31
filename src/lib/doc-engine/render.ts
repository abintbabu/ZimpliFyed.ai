import type { DocModel, DocHeader, BankDetails, InvoiceLine, PackingLine } from './models';

/**
 * Render layer (DOC_ENGINE_SPEC §1.2). A pure `DocModel → print-ready HTML string` — the document, on an
 * A4 page, ready for the browser's "Save as PDF". No React, no external fonts, no network: the string is
 * self-contained so it works in a new tab, an email attachment pipeline, or the buyer share page.
 *
 * The spec's `@react-pdf/renderer` byte renderer now lives alongside this one in `pdf.tsx`. Both read the
 * same DocModel and print the same blocks; this one stays because it needs no fonts, no bytes and no
 * server runtime — it is what serves browser print, email previews and the buyer share page. Keep the two
 * in step: a block added there should appear here too.
 */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function money(n: number, currency: string): string {
  return `${esc(currency)} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `2026-08-31` → `31 August 2026`, matching the PDF renderer's long form. */
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function headerBlock(h: DocHeader): string {
  return `
    <div class="doc-head">
      <div class="exporter">
        <div class="strong">${esc(h.exporter.legalName)}</div>
        <div>${esc(h.exporter.address)}</div>
        <div class="muted">IEC: ${esc(h.exporter.iecNumber)} · GSTIN: ${esc(h.exporter.gstin)} · AD Code: ${esc(h.exporter.adCode)}</div>
      </div>
      <div class="doc-meta">
        <div class="title">${esc(h.title)}</div>
        <div class="num">${esc(h.docNumber)}</div>
        <div class="muted">Dated ${esc(fmtDate(h.issuedAt))}</div>
      </div>
    </div>
    <div class="parties">
      <div><div class="lbl">Buyer / Consignee</div><div class="strong">${esc(h.buyer.name)}</div><div>${esc(h.buyer.address)}</div><div class="muted">${esc(h.buyer.country ?? '')}</div></div>
      <div class="terms">
        <div><span class="lbl">Incoterm</span> ${esc(h.incoterm)}</div>
        <div><span class="lbl">Origin</span> ${esc(h.originPort)}</div>
        <div><span class="lbl">Destination</span> ${esc(h.destPort)}, ${esc(h.destination)}</div>
      </div>
    </div>`;
}

/** Remittance block. Invoice-type documents only — a buyer pays against these, not against a PL or COO. */
function bankBlock(b: BankDetails): string {
  const rows: [string, string][] = [
    ['Bank Name', b.bankName],
    ['Account Name', b.accountName],
    ['Account Number', b.accountNumber],
    ['IFSC / SWIFT', b.ifscOrSwift],
    ['AD Code', b.adCode],
  ];
  return `
    <div class="bank">
      <div class="lbl">Banking details for payment</div>
      <table class="kv">
        <tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="strong">${esc(v)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function invoiceTable(lines: InvoiceLine[], total: number, totalInWords: string, currency: string): string {
  const rows = lines
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.description)}</td>
        <td class="mono">${esc(l.hsCode)}</td>
        <td class="num">${l.quantity.toLocaleString('en-IN')}</td>
        <td class="num">${money(l.unitPrice, currency)}</td>
        <td class="num">${money(l.lineTotal, currency)}</td>
      </tr>`,
    )
    .join('');
  return `
    <table>
      <thead><tr><th>#</th><th>Description</th><th>HS Code</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="5" class="num strong">Total</td><td class="num strong">${money(total, currency)}</td></tr></tfoot>
    </table>
    <div class="words"><span class="lbl">Amount in words</span><span class="strong">${esc(currency)} ${esc(totalInWords)}</span></div>`;
}

function packingTable(lines: PackingLine[], totalQty: number): string {
  const rows = lines
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.description)}</td>
        <td class="mono">${esc(l.hsCode)}</td>
        <td class="num">${l.quantity.toLocaleString('en-IN')}</td>
      </tr>`,
    )
    .join('');
  return `
    <table>
      <thead><tr><th>#</th><th>Description</th><th>HS Code</th><th class="num">Quantity</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3" class="num strong">Total Quantity</td><td class="num strong">${totalQty.toLocaleString('en-IN')}</td></tr></tfoot>
    </table>`;
}

function body(model: DocModel): string {
  switch (model.type) {
    case 'proforma_invoice':
    case 'commercial_invoice':
      return invoiceTable(model.body.lines, model.body.total, model.body.totalInWords, model.currency) + bankBlock(model.bank);
    case 'packing_list':
      return packingTable(model.body.lines, model.body.totalQuantity);
    case 'certificate_of_origin':
      return `${packingTable(model.body.lines, model.body.lines.reduce((s, l) => s + l.quantity, 0))}
        <div class="declaration"><div class="lbl">Country of Origin</div><div class="strong">${esc(model.body.countryOfOrigin)}</div><p>${esc(model.body.declaration)}</p></div>`;
  }
}

const STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #14212e; font-size: 12px; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm 16mm; margin: 0 auto; background: #fff; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #14212e; padding-bottom: 12px; }
  .doc-meta { text-align: right; }
  .title { font-size: 18px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
  .num { font-variant-numeric: tabular-nums; }
  .doc-meta .num { font-family: ui-monospace, monospace; color: #52616b; margin-top: 4px; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin: 18px 0; }
  .terms > div { margin: 2px 0; }
  .lbl { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #8a97a0; margin-right: 6px; }
  .strong { font-weight: 700; }
  .muted { color: #8a97a0; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 8px 10px; border-bottom: 1px solid #e3e8ec; text-align: left; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #52616b; background: #f5f7f8; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.mono { font-family: ui-monospace, monospace; }
  tfoot td { border-top: 2px solid #14212e; border-bottom: none; }
  .declaration { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e3e8ec; }
  .words { margin-top: 8px; padding: 8px 10px; border: 1px solid #e3e8ec; }
  .bank { margin-top: 20px; }
  .bank .lbl { display: block; margin-bottom: 6px; }
  table.kv { width: 60%; }
  table.kv th { width: 40%; font-weight: 400; }
  @page { size: A4; margin: 0; }
`;

/** One document → a full standalone HTML page. */
export function renderDocumentHtml(model: DocModel): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(model.title)} ${esc(model.docNumber)}</title><style>${STYLES}</style></head><body><div class="page">${headerBlock(model)}${body(model)}</div></body></html>`;
}

/** A whole set → one HTML page per document, each on its own printed sheet. */
export function renderDocSetHtml(models: DocModel[]): string {
  const pages = models
    .map((m) => `<div class="page" style="page-break-after: always;">${headerBlock(m)}${body(m)}</div>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Document set</title><style>${STYLES}</style></head><body>${pages}</body></html>`;
}
