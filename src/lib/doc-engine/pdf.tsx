import 'server-only';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { DocModel, DocHeader, BankDetails, InvoiceLine, PackingLine } from './models';

/**
 * PDF render layer (DOC_ENGINE_SPEC §1.2) — `DocModel → PDF bytes`, the production counterpart to the
 * HTML renderer in `render.ts`. Both read the same DocModel, so either can serve any document; the HTML
 * one stays for browser print and email-preview paths where bytes are overkill.
 *
 * Layout is ported from anabyn-website's `src/components/invoice/invoice-pdf.tsx`, which has printed real
 * export documents against real buyers and customs brokers. What changed in the port: it reads DocModel
 * instead of a Firestore invoice type, and every trace of the source company's branding, bank account,
 * jurisdiction and contact details is gone — those come from the tenant's own DocContext or not at all.
 *
 * ── Fonts ────────────────────────────────────────────────────────────────────────────────────────
 * Deliberately uses the built-in Helvetica rather than registering a webfont. anabyn's version fetched
 * Inter from a CDN at module scope, which makes every render depend on a third-party network call inside
 * a request path — the wrong trade for a document that must generate reliably. `registerDocFont()` below
 * is the opt-in hook if a tenant-branded face is ever wanted; note @react-pdf's fontkit cannot decompress
 * Brotli, so any face registered there must be `.woff`/`.ttf`, never `.woff2`.
 */

// ── Layout constants (PDF points: 1 mm ≈ 2.835 pt, A4 = 595 × 842) ───────────
const PAGE_W = 595;
const MH = 42.5; // 15 mm horizontal margin
const TW = PAGE_W - 2 * MH; // ≈ 510 pt usable width
const STRIPE_H = 8;
const RULE_H = 2.5;
const FOOTER_H = 22;
const PAD_TOP = STRIPE_H + RULE_H + 42;
const PAD_BOTTOM = FOOTER_H + 34;

// ── Colour tokens ────────────────────────────────────────────────────────────
// Mirrors the ink/line/canvas scale in `globals.css` so a generated document reads as the same product
// as the dashboard that produced it. `accent` is the one tenant-overridable value (Tenant.primaryColor).
const INK = '#14212e';
const MUTED = '#52616b';
const FAINT = '#8a97a0';
const LINE = '#e3e8ec';
const CANVAS = '#f5f7f8';
const WHITE = '#ffffff';
const DEFAULT_ACCENT = '#1b3a6b';

const F = 'Helvetica';
const FB = 'Helvetica-Bold';

export type PdfBranding = {
  /** Tenant.primaryColor. Falls back to the product navy when unset or not a valid hex. */
  accent?: string | null;
  /** Footer strip text. Defaults to the exporter's legal name from the document itself. */
  footerNote?: string | null;
};

function accentOf(branding?: PdfBranding): string {
  const c = branding?.accent?.trim();
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_ACCENT;
}

function money(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(n: number): string {
  return n.toLocaleString('en-IN');
}

/** `2026-08-31` → `31 August 2026`. Long form: customs officers read these across locales. */
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ── Shared primitives ────────────────────────────────────────────────────────

function SectionHeader({ title, accent }: { title: string; accent: string }) {
  return (
    <View style={{ backgroundColor: accent, paddingVertical: 6, paddingHorizontal: 10, marginTop: 12 }}>
      <Text style={{ fontFamily: FB, fontSize: 7.5, color: WHITE, letterSpacing: 0.6 }}>{title}</Text>
    </View>
  );
}

/** Top brand rule and bottom bar repeat on every page via `fixed`. */
function PageFurniture({ accent, footerNote }: { accent: string; footerNote: string }) {
  return (
    <>
      <View fixed style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View style={{ height: STRIPE_H, backgroundColor: accent }} />
        <View style={{ height: RULE_H, backgroundColor: INK }} />
      </View>
      <View
        fixed
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOTER_H,
          backgroundColor: INK, flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', paddingHorizontal: MH,
        }}
      >
        <Text style={{ fontFamily: F, fontSize: 6.5, color: WHITE }}>{footerNote}</Text>
        <Text
          style={{ fontFamily: F, fontSize: 6.5, color: WHITE }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </View>
    </>
  );
}

function DocumentHead({ h, accent }: { h: DocHeader; accent: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 10 }}>
      <View style={{ width: TW * 0.58 }}>
        <Text style={{ fontFamily: FB, fontSize: 12, color: accent }}>{h.exporter.legalName}</Text>
        <Text style={{ fontFamily: F, fontSize: 8, color: INK, lineHeight: 1.5, marginTop: 2 }}>{h.exporter.address}</Text>
        <Text style={{ fontFamily: F, fontSize: 7, color: MUTED, marginTop: 3 }}>
          IEC: {h.exporter.iecNumber}   ·   GSTIN: {h.exporter.gstin}   ·   AD Code: {h.exporter.adCode}
        </Text>
      </View>
      <View style={{ width: TW * 0.4, alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: FB, fontSize: 15, color: INK, letterSpacing: 0.5, textTransform: 'uppercase' }}>{h.title}</Text>
        <Text style={{ fontFamily: FB, fontSize: 9, color: MUTED, marginTop: 4 }}>{h.docNumber}</Text>
        <Text style={{ fontFamily: F, fontSize: 8, color: MUTED, marginTop: 2 }}>Dated {fmtDate(h.issuedAt)}</Text>
      </View>
    </View>
  );
}

function PartyBoxes({ h, accent }: { h: DocHeader; accent: string }) {
  const cellW = (TW - 6) / 2;
  const box = (label: string, name: string, lines: (string | undefined)[]) => (
    <View style={{ width: cellW, backgroundColor: CANVAS, borderWidth: 0.5, borderColor: LINE, borderLeftWidth: 2.5, borderLeftColor: accent, padding: '7 9' }}>
      <Text style={{ fontFamily: FB, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontFamily: FB, fontSize: 9, color: INK, marginBottom: 1 }}>{name}</Text>
      {lines.filter(Boolean).map((l, i) => (
        <Text key={i} style={{ fontFamily: F, fontSize: 8, color: INK, lineHeight: 1.5 }}>{l}</Text>
      ))}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
      {box('Exporter / Shipper', h.exporter.legalName, [h.exporter.address])}
      {box('Buyer / Consignee', h.buyer.name, [h.buyer.address, h.buyer.country])}
    </View>
  );
}

/** Trade terms as a 4-up grid. Empty cells are dropped rather than printed blank. */
function TradeGrid({ h, accent }: { h: DocHeader; accent: string }) {
  const cells: [string, string][] = [
    ['Incoterm 2020', h.incoterm],
    ['Port of Loading', h.originPort],
    ['Port of Discharge', h.destPort],
    ['Final Destination', h.destination],
    ['Currency', h.currency],
  ];
  const present = cells.filter(([, v]) => v && v.trim());
  const perRow = 4;
  const cellW = TW / perRow;
  const rows: [string, string][][] = [];
  for (let i = 0; i < present.length; i += perRow) rows.push(present.slice(i, i + perRow));

  return (
    <View>
      <SectionHeader title="SHIPMENT & TRADE TERMS" accent={accent} />
      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: LINE }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', borderBottomWidth: ri < rows.length - 1 ? 0.5 : 0, borderBottomColor: LINE }}>
            {row.map(([label, value], ci) => (
              <View key={ci} style={{ width: cellW, padding: '6 8', borderRightWidth: ci < row.length - 1 ? 0.5 : 0, borderRightColor: LINE }}>
                <Text style={{ fontFamily: F, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
                <Text style={{ fontFamily: FB, fontSize: 8.5, color: INK, marginTop: 2 }}>{value}</Text>
              </View>
            ))}
            {/* Pad the last row so its cell borders line up with the rows above. */}
            {row.length < perRow && <View style={{ width: cellW * (perRow - row.length) }} />}
          </View>
        ))}
      </View>
    </View>
  );
}

function Th({ text, width, align = 'left' }: { text: string; width: number; align?: 'left' | 'right' }) {
  return (
    <View style={{ width, padding: '6 8' }}>
      <Text style={{ fontFamily: FB, fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: align }}>{text}</Text>
    </View>
  );
}

function Td({ text, width, align = 'left', bold = false, mono = false }: { text: string; width: number; align?: 'left' | 'right'; bold?: boolean; mono?: boolean }) {
  return (
    <View style={{ width, padding: '6 8' }}>
      <Text style={{ fontFamily: bold ? FB : mono ? 'Courier' : F, fontSize: 8, color: INK, textAlign: align }}>{text}</Text>
    </View>
  );
}

function InvoiceTable({ lines, total, totalInWords, currency, accent }: { lines: InvoiceLine[]; total: number; totalInWords: string; currency: string; accent: string }) {
  const w = { n: TW * 0.05, desc: TW * 0.37, hs: TW * 0.14, qty: TW * 0.12, price: TW * 0.15, amt: TW * 0.17 };
  return (
    <View>
      <SectionHeader title="GOODS DESCRIPTION" accent={accent} />
      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: LINE }}>
        <View style={{ flexDirection: 'row', backgroundColor: CANVAS, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
          <Th text="#" width={w.n} />
          <Th text="Description of Goods" width={w.desc} />
          <Th text="HS Code" width={w.hs} />
          <Th text="Quantity" width={w.qty} align="right" />
          <Th text="Unit Price" width={w.price} align="right" />
          <Th text="Amount" width={w.amt} align="right" />
        </View>
        {lines.map((l, i) => (
          // `wrap={false}` keeps a single line item from splitting across a page break.
          <View key={i} wrap={false} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE }}>
            <Td text={String(i + 1)} width={w.n} />
            <Td text={l.description} width={w.desc} />
            <Td text={l.hsCode} width={w.hs} mono />
            <Td text={qty(l.quantity)} width={w.qty} align="right" />
            <Td text={money(l.unitPrice, currency)} width={w.price} align="right" />
            <Td text={money(l.lineTotal, currency)} width={w.amt} align="right" bold />
          </View>
        ))}
        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: INK, backgroundColor: CANVAS }}>
          <Td text="Total" width={w.n + w.desc + w.hs + w.qty + w.price} align="right" bold />
          <Td text={money(total, currency)} width={w.amt} align="right" bold />
        </View>
      </View>
      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: LINE, padding: '6 8', backgroundColor: WHITE }}>
        <Text style={{ fontFamily: F, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Amount in words</Text>
        <Text style={{ fontFamily: FB, fontSize: 8.5, color: INK, marginTop: 2 }}>{currency} {totalInWords}</Text>
      </View>
    </View>
  );
}

function PackingTable({ lines, totalQuantity, accent }: { lines: PackingLine[]; totalQuantity: number; accent: string }) {
  const w = { n: TW * 0.06, desc: TW * 0.54, hs: TW * 0.2, qty: TW * 0.2 };
  return (
    <View>
      <SectionHeader title="PACKING DETAILS" accent={accent} />
      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: LINE }}>
        <View style={{ flexDirection: 'row', backgroundColor: CANVAS, borderBottomWidth: 0.5, borderBottomColor: LINE }}>
          <Th text="#" width={w.n} />
          <Th text="Description of Goods" width={w.desc} />
          <Th text="HS Code" width={w.hs} />
          <Th text="Quantity" width={w.qty} align="right" />
        </View>
        {lines.map((l, i) => (
          <View key={i} wrap={false} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE }}>
            <Td text={String(i + 1)} width={w.n} />
            <Td text={l.description} width={w.desc} />
            <Td text={l.hsCode} width={w.hs} mono />
            <Td text={qty(l.quantity)} width={w.qty} align="right" />
          </View>
        ))}
        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: INK, backgroundColor: CANVAS }}>
          <Td text="Total Quantity" width={w.n + w.desc + w.hs} align="right" bold />
          <Td text={qty(totalQuantity)} width={w.qty} align="right" bold />
        </View>
      </View>
    </View>
  );
}

function BankingDetails({ bank, accent }: { bank: BankDetails; accent: string }) {
  const lW = TW * 0.18;
  const vW = TW * 0.32;
  const rows: [string, string, string, string][] = [
    ['Bank Name', bank.bankName, 'Account Name', bank.accountName],
    ['Account Number', bank.accountNumber, 'IFSC / SWIFT', bank.ifscOrSwift],
    ['AD Code', bank.adCode, '', ''],
  ];
  return (
    <View wrap={false}>
      <SectionHeader title="BANKING DETAILS FOR PAYMENT" accent={accent} />
      <View style={{ borderWidth: 0.5, borderTopWidth: 0, borderColor: LINE }}>
        {rows.map(([l1, v1, l2, v2], ri) => (
          <View key={ri} style={{ flexDirection: 'row', borderBottomWidth: ri < rows.length - 1 ? 0.5 : 0, borderBottomColor: LINE }}>
            <View style={{ width: lW, padding: '5 8', backgroundColor: CANVAS }}>
              <Text style={{ fontFamily: F, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l1}</Text>
            </View>
            <View style={{ width: vW, padding: '5 8' }}>
              <Text style={{ fontFamily: FB, fontSize: 8.5, color: INK }}>{v1}</Text>
            </View>
            {l2 ? (
              <>
                <View style={{ width: lW, padding: '5 8', backgroundColor: CANVAS }}>
                  <Text style={{ fontFamily: F, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l2}</Text>
                </View>
                <View style={{ width: vW, padding: '5 8' }}>
                  <Text style={{ fontFamily: FB, fontSize: 8.5, color: INK }}>{v2}</Text>
                </View>
              </>
            ) : (
              <View style={{ width: lW + vW }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Declaration + signature block. The declaration text is passed in per document type rather than being a
 * constant, because what the exporter is certifying differs between an invoice and a certificate of origin.
 */
function SignatoryBlock({ declaration, forCompany }: { declaration: string; forCompany: string }) {
  return (
    <View wrap={false} style={{ flexDirection: 'row', borderWidth: 0.5, borderColor: LINE, marginTop: 12 }}>
      <View style={{ width: TW * 0.55, padding: '8 10', borderRightWidth: 0.5, borderRightColor: LINE, backgroundColor: CANVAS }}>
        <Text style={{ fontFamily: FB, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Declaration</Text>
        <Text style={{ fontFamily: F, fontSize: 7.5, color: INK, lineHeight: 1.55 }}>{declaration}</Text>
      </View>
      <View style={{ width: TW * 0.45, padding: '8 10', alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: FB, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Authorised Signatory</Text>
        <View style={{ height: 30 }} />
        <Text style={{ fontFamily: F, fontSize: 8, color: FAINT }}>___________________________</Text>
        <Text style={{ fontFamily: FB, fontSize: 8, color: INK, marginTop: 2 }}>For {forCompany}</Text>
      </View>
    </View>
  );
}

const DECLARATION: Record<DocModel['type'], string> = {
  proforma_invoice:
    'This proforma invoice is issued for the buyer’s reference and does not constitute a contract of sale. The particulars stated are true and correct to the best of our knowledge.',
  commercial_invoice:
    'We certify that this invoice is true, correct and complete, and that the goods described herein comply with all applicable export regulations.',
  packing_list:
    'We certify that the packing particulars stated in this list are true and correct at the time of dispatch and correspond to the accompanying commercial invoice.',
  certificate_of_origin:
    'We certify that the goods described herein are wholly obtained or sufficiently transformed in the stated country of origin, and that the particulars given are true and correct.',
};

// ── One document → one Page ──────────────────────────────────────────────────

function DocumentPage({ model, branding }: { model: DocModel; branding?: PdfBranding }) {
  const accent = accentOf(branding);
  const footerNote = branding?.footerNote?.trim() || model.exporter.legalName;
  const isInvoice = model.type === 'proforma_invoice' || model.type === 'commercial_invoice';

  return (
    <Page size="A4" style={{ fontFamily: F, paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM, paddingHorizontal: MH, color: INK }}>
      <PageFurniture accent={accent} footerNote={footerNote} />
      <DocumentHead h={model} accent={accent} />
      <PartyBoxes h={model} accent={accent} />
      <TradeGrid h={model} accent={accent} />

      {isInvoice && (
        <InvoiceTable
          lines={model.body.lines}
          total={model.body.total}
          totalInWords={model.body.totalInWords}
          currency={model.currency}
          accent={accent}
        />
      )}

      {model.type === 'packing_list' && (
        <PackingTable lines={model.body.lines} totalQuantity={model.body.totalQuantity} accent={accent} />
      )}

      {model.type === 'certificate_of_origin' && (
        <>
          <PackingTable
            lines={model.body.lines}
            totalQuantity={model.body.lines.reduce((s, l) => s + l.quantity, 0)}
            accent={accent}
          />
          <View wrap={false} style={{ borderWidth: 0.5, borderColor: LINE, padding: '8 10', marginTop: 12 }}>
            <Text style={{ fontFamily: F, fontSize: 6.5, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.5 }}>Country of Origin</Text>
            <Text style={{ fontFamily: FB, fontSize: 11, color: accent, marginTop: 2 }}>{model.body.countryOfOrigin}</Text>
            <Text style={{ fontFamily: F, fontSize: 7.5, color: INK, lineHeight: 1.55, marginTop: 5 }}>{model.body.declaration}</Text>
          </View>
        </>
      )}

      {/* Remittance details belong on the documents a buyer pays against, not on PL/COO. */}
      {isInvoice && <BankingDetails bank={model.bank} accent={accent} />}

      <SignatoryBlock declaration={DECLARATION[model.type]} forCompany={model.exporter.legalName} />
    </Page>
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/** One document → PDF bytes. */
export function renderDocumentPdf(model: DocModel, branding?: PdfBranding): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`${model.title} ${model.docNumber}`} author={model.exporter.legalName}>
      <DocumentPage model={model} branding={branding} />
    </Document>,
  );
}

/** A whole set → one PDF, each document starting on a fresh page, in the order given. */
export function renderDocSetPdf(models: DocModel[], branding?: PdfBranding): Promise<Buffer> {
  const first = models[0];
  return renderToBuffer(
    <Document title={first ? `Document set ${first.docNumber}` : 'Document set'} author={first?.exporter.legalName}>
      {models.map((m, i) => (
        <DocumentPage key={i} model={m} branding={branding} />
      ))}
    </Document>,
  );
}
