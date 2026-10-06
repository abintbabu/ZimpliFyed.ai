import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getOrder } from '@/actions/orders';
import { listDocuments } from '@/actions/documents';
import { listExportDocuments } from '@/actions/export-documents';
import { getOrderDocSet } from '@/actions/doc-sets';
import { listShipmentMilestones } from '@/actions/shipment-milestones';
import { listLettersOfCredit } from '@/actions/letters-of-credit';
import { getOrderPnl } from '@/actions/order-pnl';
import { DealRail } from '@/components/deal-rail';
import { DocumentPanel } from '@/components/document-panel';
import { DocReadinessPanel } from '@/components/doc-readiness-panel';
import { buildDocContext } from '@/lib/doc-engine/context';
import { ExportDocumentsPanel } from '@/components/export-documents-panel';
import { DocSetPanel } from '@/components/doc-set-panel';
import { ShipmentTimelinePanel } from '@/components/shipment-timeline-panel';
import { LcAdvisorPanel } from '@/components/lc-advisor-panel';
import { OrderPnlPanel } from '@/components/order-pnl-panel';
import { MarginLeakPanel } from '@/components/margin-leak-panel';
import { getOrderMarginLeak } from '@/actions/margin-leak';
import { OrderLinesPanel } from '@/components/order-lines-panel';
import { PackingPanel } from '@/components/packing-panel';
import { LoadPlannerPanel } from '@/components/load-planner-panel';
import { OrderStatusActions } from './order-status-actions';
import { listShipmentsForOrder } from '@/actions/shipments';
import { OrderShipmentAction } from './order-shipment-action';
import { OrderInvoiceAction } from './order-invoice-action';
import { OrderBuyerTrackPanel } from './order-buyer-track';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return <p className="text-sm text-muted">You do not have access to orders.</p>;
  }

  const order = await getOrder(id);
  if (!order) notFound();

  const invoice = order.invoices[0] ?? null;
  const documents = await listDocuments('orders', order.id);
  const exportDocuments = await listExportDocuments(order.id);
  const milestones = await listShipmentMilestones(order.id);
  const letterOfCredits = await listLettersOfCredit(order.id);
  const pnl = await getOrderPnl(order.id);
  const marginLeak = await getOrderMarginLeak(order.id);
  const docContext = await buildDocContext(tenantId, order.id);
  const docSet = await getOrderDocSet(order.id);
  const shipments = await listShipmentsForOrder(order.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{order.orderNumber}</h1>
          <p className="text-sm text-muted capitalize">{order.status.replace('_', ' ')}</p>
        </div>
        <div className="flex items-center gap-3">
          <OrderShipmentAction orderId={order.id} shipments={shipments} canWrite={hasPermission(role, 'orders:write')} />
          <OrderInvoiceAction
            orderId={order.id}
            invoiceId={invoice?.id ?? null}
            canWrite={hasPermission(role, 'invoices:write')}
          />
          <OrderStatusActions orderId={order.id} status={order.status} canWrite={hasPermission(role, 'orders:write')} />
        </div>
      </div>

      <DealRail current="order" quote={order.quote} order={order} invoice={invoice} />

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white p-4 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted">Product</p><p className="text-ink">{order.product ?? '—'}</p></div>
        <div><p className="text-xs text-muted">Quantity</p><p className="text-ink">{order.quantity ?? '—'} {order.unit ?? ''}</p></div>
        <div><p className="text-xs text-muted">Incoterm</p><p className="text-ink">{order.incoterm ?? '—'}</p></div>
        <div><p className="text-xs text-muted">Destination</p><p className="text-ink">{order.destination ?? '—'}</p></div>
      </div>

      <OrderLinesPanel
        orderId={order.id}
        currency={order.currency ?? order.quote?.currency ?? 'USD'}
        canWrite={hasPermission(role, 'orders:write')}
        initial={order.lines.length > 0 ? order.lines : (order.quote?.lines ?? []).map((l) => ({ id: l.id, description: l.description, hsCode: null, quantity: l.quantity, uom: null, unitPrice: l.unitPrice }))}
      />

      {order.lines.length > 0 && (
        <PackingPanel
          orderId={order.id}
          canWrite={hasPermission(role, 'orders:write')}
          lines={order.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity }))}
          initial={order.packingEntries}
        />
      )}

      {order.packingEntries.length > 0 && <LoadPlannerPanel entries={order.packingEntries} />}

      <OrderBuyerTrackPanel orderId={order.id} tracks={order.buyerTracks} />

      <OrderPnlPanel pnl={pnl} currency={order.currency ?? order.quote?.currency ?? invoice?.currency ?? 'USD'} />

      <MarginLeakPanel report={marginLeak} />

      <ShipmentTimelinePanel
        orderId={order.id}
        initialMilestones={milestones}
        canWrite={hasPermission(role, 'orders:write')}
      />

      <LcAdvisorPanel
        orderId={order.id}
        initialLcs={letterOfCredits}
        canWrite={hasPermission(role, 'orders:write')}
        orderShipped={['shipped', 'in_transit', 'delivered'].includes(order.status)}
      />

      <DocReadinessPanel result={docContext} />

      <DocSetPanel orderId={order.id} initialDocSet={docSet} canWrite={hasPermission(role, 'orders:write')} />

      <ExportDocumentsPanel
        orderId={order.id}
        initialDocs={exportDocuments}
        canWrite={hasPermission(role, 'orders:write')}
      />

      <DocumentPanel
        collection="orders"
        documentId={order.id}
        initialDocuments={documents}
        canWrite={hasPermission(role, 'orders:write')}
      />
    </div>
  );
}
