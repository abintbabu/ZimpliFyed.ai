import 'server-only';
import JSZip from 'jszip';
import { prisma } from '@/lib/prisma';

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))];
  return lines.join('\n');
}

/**
 * Builds the owner-requested data export zip (BILLING_SPEC §4): one CSV per module plus a full JSON dump.
 * Document *binaries* (stored ExportDocument/uploaded files) aren't re-fetched and bundled here yet — this
 * covers the structured data; adding the documents/ folder with actual file bytes is a follow-up once export
 * volume justifies the extra storage round-trips.
 */
export async function buildTenantExportZip(tenantId: string): Promise<Buffer> {
  const [leads, buyers, quotes, orders, invoices, vendors, products, complianceItems, exportDocuments, tasks] = await Promise.all([
    prisma.lead.findMany({ where: { tenantId } }),
    prisma.buyer.findMany({ where: { tenantId } }),
    prisma.quote.findMany({ where: { tenantId } }),
    prisma.order.findMany({ where: { tenantId } }),
    prisma.invoice.findMany({ where: { tenantId } }),
    prisma.vendor.findMany({ where: { tenantId } }),
    prisma.product.findMany({ where: { tenantId } }),
    prisma.complianceItem.findMany({ where: { tenantId } }),
    prisma.exportDocument.findMany({ where: { tenantId } }),
    prisma.task.findMany({ where: { tenantId } }),
  ]);

  const modules: Record<string, Record<string, unknown>[]> = {
    leads,
    buyers,
    quotes,
    orders,
    invoices,
    vendors,
    products,
    compliance_items: complianceItems,
    export_documents: exportDocuments,
    tasks,
  };

  const zip = new JSZip();
  for (const [name, rows] of Object.entries(modules)) {
    zip.file(`csv/${name}.csv`, toCsv(rows as Record<string, unknown>[]));
  }
  zip.file('full-export.json', JSON.stringify(modules, null, 2));

  return zip.generateAsync({ type: 'nodebuffer' });
}
