import type { ExportDocumentType } from '@prisma/client';

export const EXPORT_DOCUMENT_LABELS: Record<ExportDocumentType, string> = {
  proforma_invoice: 'Proforma Invoice',
  commercial_invoice: 'Commercial Invoice',
  packing_list: 'Packing List',
  certificate_of_origin: 'Certificate of Origin',
};

export type DocumentLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ExportDocumentData = {
  orderNumber: string;
  incoterm: string | null;
  destination: string | null;
  originPort: string | null;
  destPort: string | null;
  buyerName: string;
  buyerAddress: string;
  currency: string;
  lines: DocumentLineItem[];
  total: number;
};

type BuildInput = {
  order: {
    orderNumber: string;
    incoterm: string | null;
    destination: string | null;
    originPort: string | null;
    destPort: string | null;
  };
  buyerName: string;
  buyerAddress: string;
  currency: string;
  lines: DocumentLineItem[];
};

/** Builds the field snapshot for a new export document version — same shape for every doc type; the type only changes which template renders it. */
export function buildExportDocumentData(input: BuildInput): ExportDocumentData {
  const total = parseFloat(input.lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2));
  return {
    orderNumber: input.order.orderNumber,
    incoterm: input.order.incoterm,
    destination: input.order.destination,
    originPort: input.order.originPort,
    destPort: input.order.destPort,
    buyerName: input.buyerName,
    buyerAddress: input.buyerAddress,
    currency: input.currency,
    lines: input.lines,
    total,
  };
}
