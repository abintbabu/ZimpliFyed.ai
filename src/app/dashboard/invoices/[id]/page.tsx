import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getInvoice } from '@/actions/invoices';
import { prisma } from '@/lib/prisma';
import { DealRail } from '@/components/deal-rail';

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

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Unit price</th>
              <th className="px-4 py-3">Line total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-4 py-3 text-ink">{l.description}</td>
                <td className="px-4 py-3 text-muted">{l.quantity}</td>
                <td className="px-4 py-3 text-muted">{l.unitPrice.toFixed(2)}</td>
                <td className="px-4 py-3 text-muted">{l.lineTotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-3 text-right text-sm font-medium text-ink">
          Balance due: {invoice.currency} {invoice.balanceDue.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
