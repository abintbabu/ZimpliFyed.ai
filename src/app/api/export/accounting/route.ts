import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { latestRates, DEFAULT_BASE_CURRENCY } from '@/lib/fx';
import { accountantCsv, tallyVouchersXml, type ExportInvoice, type ExportBill } from '@/lib/accounting-export';

/**
 * Accountant export (CSV or Tally voucher XML) of invoices, notes and supplier bills. Tenant-scoped by the
 * session; gated on `data:export` and audited, because it hands the books to a file.
 */
export async function GET(req: Request) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'data:export')) return NextResponse.json({ error: 'You do not have permission to export data' }, { status: 403 });

  const format = new URL(req.url).searchParams.get('format');
  if (format !== 'csv' && format !== 'tally') return NextResponse.json({ error: 'format must be csv or tally' }, { status: 400 });

  const [invoices, bills, fx, tenant] = await Promise.all([
    prisma.invoice.findMany({ where: { tenantId, isDemo: false }, include: { order: { select: { buyer: { select: { name: true } } } } }, orderBy: { createdAt: 'asc' } }),
    prisma.vendorBill.findMany({ where: { tenantId }, include: { vendor: { select: { name: true } } }, orderBy: { billDate: 'asc' } }),
    prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { legalName: true, name: true } }),
  ]);

  const exportInvoices: ExportInvoice[] = invoices.map((i) => ({ invoiceNumber: i.invoiceNumber, createdAt: i.createdAt, dueDate: i.dueDate, currency: i.currency, total: i.total, status: i.status, isCreditOrDebitNote: i.isCreditOrDebitNote, noteKind: i.noteKind, buyerName: i.order?.buyer?.name ?? null }));
  const exportBills: ExportBill[] = bills.map((b) => ({ billNumber: b.billNumber, billDate: b.billDate, currency: b.currency, total: b.total, status: b.status, vendorName: b.vendor.name }));
  const stamp = new Date().toISOString().slice(0, 10);

  await writeAudit({ session, collection: 'accounting_export', documentId: stamp, action: 'download', summary: `Exported accounting data (${format})`, after: { invoices: exportInvoices.length, bills: exportBills.length } });

  if (format === 'csv') {
    return new NextResponse(accountantCsv(exportInvoices, exportBills), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="accounting-${stamp}.csv"`, 'Cache-Control': 'no-store' },
    });
  }

  const result = tallyVouchersXml(exportInvoices, exportBills, { company: tenant?.legalName ?? tenant?.name ?? 'Company', baseCurrency: DEFAULT_BASE_CURRENCY, rates: latestRates(fx) });
  return new NextResponse(result.xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="tally-vouchers-${stamp}.xml"`,
      'Cache-Control': 'no-store',
      // Skipped documents (no rate / no party) are reported here rather than silently dropped.
      'X-Export-Skipped': encodeURIComponent(JSON.stringify(result.skipped.slice(0, 50))),
      'X-Export-Count': String(result.exported),
    },
  });
}
