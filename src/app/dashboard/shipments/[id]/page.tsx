import { FreightComparisonPanel } from '@/components/freight-comparison-panel';
import { latestRates } from '@/lib/fx';
import { prisma } from '@/lib/prisma';
import { EntityDocuments } from '@/components/entity-documents';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getShipment } from '@/actions/shipments';
import { Card, CardHeader } from '@/components/dashboard/card';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { ShipmentStatusActions, ShipmentDetailsForm, ContainersPanel, FreightQuotesPanel } from './shipment-panels';

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return <p className="text-sm text-muted">You do not have access to shipments.</p>;
  }

  const shipment = await getShipment(id);
  if (!shipment) notFound();
  const fxSnapshots = await prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 });
  const canWrite = hasPermission(role, 'orders:write');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{shipment.shipmentNumber}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Badge tone={statusTone(shipment.status)} dot>{shipment.status.replace('_', ' ')}</Badge>
            <span>{shipment.mode.replace('_', ' ').toUpperCase()}</span>
          </div>
        </div>
        <ShipmentStatusActions shipmentId={shipment.id} status={shipment.status} canWrite={canWrite} />
      </div>

      <Card>
        <CardHeader title="Orders on this shipment" />
        <ul className="space-y-1 text-sm">
          {shipment.orders.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/orders/${o.order.id}`} className="font-medium text-ink hover:text-brand">{o.order.orderNumber}</Link>
              <span className="text-muted"> · {o.order.product ?? '—'} → {o.order.destination ?? '—'}</span>
            </li>
          ))}
        </ul>
      </Card>

      <ShipmentDetailsForm
        canWrite={canWrite}
        shipment={{
          id: shipment.id,
          mode: shipment.mode,
          forwarderName: shipment.forwarderName ?? '',
          carrier: shipment.carrier ?? '',
          vesselOrFlight: shipment.vesselOrFlight ?? '',
          bookingNumber: shipment.bookingNumber ?? '',
          originPort: shipment.originPort ?? '',
          destPort: shipment.destPort ?? '',
          etd: shipment.etd?.toISOString().slice(0, 10) ?? '',
          eta: shipment.eta?.toISOString().slice(0, 10) ?? '',
          blNumber: shipment.blNumber ?? '',
          blDate: shipment.blDate?.toISOString().slice(0, 10) ?? '',
          shippingBillNumber: shipment.shippingBillNumber ?? '',
          shippingBillDate: shipment.shippingBillDate?.toISOString().slice(0, 10) ?? '',
          shippingBillPort: shipment.shippingBillPort ?? '',
          notes: shipment.notes ?? '',
        }}
      />

      <ContainersPanel
        shipmentId={shipment.id}
        canWrite={canWrite}
        containers={shipment.containers.map((c) => ({ id: c.id, containerNumber: c.containerNumber, type: c.type, sealNumber: c.sealNumber, grossWeightKg: c.grossWeightKg, cbm: c.cbm }))}
      />

      <FreightQuotesPanel
        shipmentId={shipment.id}
        canWrite={canWrite}
        defaultMode={shipment.mode}
        quotes={shipment.freightQuotes.map((q) => ({ id: q.id, forwarderName: q.forwarderName, mode: q.mode, currency: q.currency, amount: q.amount, transitDays: q.transitDays, validTo: q.validTo?.toISOString().slice(0, 10) ?? null, status: q.status }))}
      />

      <FreightComparisonPanel
        quotes={shipment.freightQuotes.map((q) => ({ id: q.id, forwarderName: q.forwarderName, mode: q.mode, currency: q.currency, amount: q.amount, transitDays: q.transitDays, validTo: q.validTo?.toISOString().slice(0, 10) ?? null, status: q.status }))}
        mode={shipment.mode}
        cbm={shipment.containers.reduce((s, c) => s + (c.cbm ?? 0), 0) || null}
        weightKg={shipment.containers.reduce((s, c) => s + (c.grossWeightKg ?? 0), 0) || null}
        rates={latestRates(fxSnapshots)}
        currencies={[...new Set([...shipment.freightQuotes.map((q) => q.currency.toUpperCase()), 'USD', 'INR'])]}
      />

      <EntityDocuments collection="shipments" documentId={id} canWrite={hasPermission(role, 'orders:write')} />
    </div>
  );
}
