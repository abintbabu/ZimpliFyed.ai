import Link from 'next/link';
import { Ship } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listShipments } from '@/actions/shipments';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';

type Shipment = Awaited<ReturnType<typeof listShipments>>[number];

export default async function ShipmentsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return <p className="text-sm text-muted">You do not have access to shipments.</p>;
  }

  const shipments = await listShipments(tenantId);

  const columns: DataTableColumn<Shipment>[] = [
    {
      key: 'shipmentNumber',
      header: 'Shipment #',
      render: (s) => (
        <Link href={`/dashboard/shipments/${s.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {s.shipmentNumber}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', render: (s) => <Badge tone={statusTone(s.status)} dot>{s.status.replace('_', ' ')}</Badge> },
    { key: 'mode', header: 'Mode', render: (s) => s.mode.replace('_', ' ').toUpperCase() },
    { key: 'orders', header: 'Orders', render: (s) => s.orders.map((o) => o.order.orderNumber).join(', ') || '—' },
    { key: 'route', header: 'Route', render: (s) => (s.originPort || s.destPort ? `${s.originPort ?? '?'} → ${s.destPort ?? '?'}` : '—') },
    { key: 'eta', header: 'ETA', render: (s) => (s.eta ? s.eta.toLocaleDateString() : '—') },
    { key: 'containers', header: 'Containers', render: (s) => s.containers.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Shipments" description="Bookings, containers, freight quotes and shipping documents. Create one from an order." />
      <DataTable
        columns={columns}
        rows={shipments}
        rowKey={(s) => s.id}
        empty={<EmptyState icon={Ship} title="No shipments yet" description="Open an order and choose “Create shipment”." />}
      />
    </div>
  );
}
