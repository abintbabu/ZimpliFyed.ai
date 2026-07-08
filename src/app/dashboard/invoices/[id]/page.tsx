import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getInvoice } from '@/actions/invoices';
import { prisma } from '@/lib/prisma';
import { DealRail } from '@/components/deal-rail';
import { InvoiceLineItemsPanel } from '@/components/invoice-line-items-panel';

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:read')) {
    return <p className="text-sm text-muted">You do not have access to invoices.</p>;
  }

  const invoice = await getInvoice(tenantId, id);
  if (!invoice) notFound();

  const order = invoice.orderId ? await prisma.order.findFirst({ where: { id: invoice.orderId, tenantId }, include: { quote: true } }) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{invoice.invoiceNumber}</h1>
        <p className="text-sm text-muted capitalize">{invoice.status}</p>
      </div>

      <DealRail current="invoice" quote={order?.quote} order={order} invoice={invoice} />

      <InvoiceLineItemsPanel
        invoiceId={invoice.id}
        currency={invoice.currency}
        canWrite={hasPermission(role, 'invoices:write')}
        initial={invoice.lines}
      />

      <div className="rounded-2xl border border-line bg-white px-4 py-3 text-right text-sm font-medium text-ink">
        Balance due: {invoice.currency} {invoice.balanceDue.toFixed(2)}
      </div>
    </div>
  );
}
