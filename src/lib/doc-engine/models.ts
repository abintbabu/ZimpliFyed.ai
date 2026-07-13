import type { DocContext } from './context';

/**
 * DocModel layer (DOC_ENGINE_SPEC §1.2, build step 2).
 *
 * A DocModel is the typed intermediate between DocContext and a rendered document — never
 * context → PDF directly. The validation layer (rules.ts) and the AI pass read DocModels, so what
 * will print is exactly what gets checked. Builders are PURE functions of DocContext (+ the assigned
 * document number): identical context ⇒ identical model. That purity is what the golden harness pins.
 *
 * No jurisdiction logic lives here beyond field selection — India-specific presentation belongs in a
 * CountryPack (COUNTRY_PACK_SPEC); these four templates are the pack-neutral core.
 */

export type DocType = 'proforma_invoice' | 'commercial_invoice' | 'packing_list' | 'certificate_of_origin';

export const DOC_SERIES: Record<DocType, string> = {
  proforma_invoice: 'PI',
  commercial_invoice: 'CI',
  packing_list: 'PL',
  certificate_of_origin: 'COO',
};

export const DOC_TITLE: Record<DocType, string> = {
  proforma_invoice: 'Proforma Invoice',
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  certificate_of_origin: 'Certificate of Origin',
};

/** A monetary line on an invoice-type document. Amounts are rounded to 2dp at build time. */
export type InvoiceLine = {
  description: string;
  hsCode: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

/** A physical line on a packing list. */
export type PackingLine = {
  description: string;
  hsCode: string;
  quantity: number;
};

export type Party = { name: string; address: string; country?: string };

export type ExporterIdentity = {
  legalName: string;
  address: string;
  iecNumber: string;
  gstin: string;
};

/** The union — every doc type shares a header (number, title, exporter, buyer, incoterm) and adds its body. */
export type DocModel =
  | ({ type: 'proforma_invoice'; body: InvoiceBody } & DocHeader)
  | ({ type: 'commercial_invoice'; body: InvoiceBody } & DocHeader)
  | ({ type: 'packing_list'; body: PackingBody } & DocHeader)
  | ({ type: 'certificate_of_origin'; body: OriginBody } & DocHeader);

export type DocHeader = {
  docNumber: string;
  title: string;
  exporter: ExporterIdentity;
  buyer: Party;
  incoterm: string;
  originPort: string;
  destPort: string;
  destination: string;
  currency: string;
};

export type InvoiceBody = { lines: InvoiceLine[]; total: number };
export type PackingBody = { lines: PackingLine[]; totalQuantity: number };
export type OriginBody = { lines: PackingLine[]; countryOfOrigin: string; declaration: string };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function header(ctx: DocContext, type: DocType, docNumber: string): DocHeader {
  return {
    docNumber,
    title: DOC_TITLE[type],
    exporter: {
      legalName: ctx.tenant.legalName,
      address: ctx.tenant.registeredAddress,
      iecNumber: ctx.tenant.iecNumber,
      gstin: ctx.tenant.gstin,
    },
    buyer: { name: ctx.buyer.name, address: ctx.buyer.address, country: ctx.buyer.country },
    incoterm: ctx.shipment.incoterm,
    originPort: ctx.shipment.originPort,
    destPort: ctx.shipment.destPort,
    destination: ctx.shipment.destination,
    currency: ctx.currency,
  };
}

function invoiceBody(ctx: DocContext): InvoiceBody {
  const lines: InvoiceLine[] = ctx.lines.map((l) => ({
    description: l.description,
    hsCode: l.hsCode,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: round2(l.quantity * l.unitPrice),
  }));
  const total = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  return { lines, total };
}

function packingBody(ctx: DocContext): PackingBody {
  const lines: PackingLine[] = ctx.lines.map((l) => ({
    description: l.description,
    hsCode: l.hsCode,
    quantity: l.quantity,
  }));
  const totalQuantity = round2(lines.reduce((sum, l) => sum + l.quantity, 0));
  return { lines, totalQuantity };
}

/** Build one DocModel from context. `docNumber` is assigned by the numbering counter (numbering.ts). */
export function buildDocModel(type: DocType, ctx: DocContext, docNumber: string): DocModel {
  const head = header(ctx, type, docNumber);
  switch (type) {
    case 'proforma_invoice':
      return { type, ...head, body: invoiceBody(ctx) };
    case 'commercial_invoice':
      return { type, ...head, body: invoiceBody(ctx) };
    case 'packing_list':
      return { type, ...head, body: packingBody(ctx) };
    case 'certificate_of_origin':
      return {
        type,
        ...head,
        body: {
          lines: packingBody(ctx).lines,
          countryOfOrigin: originCountry(ctx),
          declaration: `We hereby certify that the goods described herein originate in ${originCountry(ctx)}.`,
        },
      };
  }
}

/** Origin is derived from the exporter's jurisdiction; pack-neutral default is India for the `in` pack.
 * A future CountryPack supplies this — kept here as a single override point, not scattered in templates. */
function originCountry(ctx: DocContext): string {
  void ctx;
  return 'India';
}

export const ALL_DOC_TYPES: DocType[] = [
  'proforma_invoice',
  'commercial_invoice',
  'packing_list',
  'certificate_of_origin',
];
