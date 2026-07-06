import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getOrder } from '@/actions/orders';
import { DealRail } from '@/components/deal-rail';
import { OrderStatusActions } from './order-status-actions';
import { OrderBuyerTrackPanel } from './order-buyer-track';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return <p className="text-sm text-muted">You do not have access to orders.</p>;
  }

  const order = await getOrder(tenantId, id);
  if (!order) notFound();

  const invoice = order.invoices[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{order.orderNumber}</h1>
          <p className="text-sm text-muted capitalize">{order.status.replace('_', ' ')}</p>
        </div>
        <OrderStatusActions orderId={order.id} status={order.status} canWrite={hasPermission(role, 'orders:write')} />
      </div>

      <DealRail current="order" quote={order.quote} order={order} invoice={invoice} />

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white p-4 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted">Product</p><p className="text-ink">{order.product ?? '—'}</p></div>
        <div><p className="text-xs text-muted">Quantity</p><p className="text-ink">{order.quantity ?? '—'} {order.unit ?? ''}</p></div>
        <div><p className="text-xs text-muted">Incoterm</p><p className="text-ink">{order.incoterm ?? '—'}</p></div>
        <div><p className="text-xs text-muted">Destination</p><p className="text-ink">{order.destination ?? '—'}</p></div>
      </div>

      <OrderBuyerTrackPanel orderId={order.id} tracks={order.buyerTracks} />
    </div>
  );
}
