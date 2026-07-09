import Link from 'next/link';
import { Package } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listOrders } from '@/actions/orders';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';

type Order = Awaited<ReturnType<typeof listOrders>>[number];

export default async function OrdersPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return <p className="text-sm text-muted">You do not have access to orders.</p>;
  }

  const orders = await listOrders(tenantId);

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (o) => (
        <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {o.orderNumber}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (
        <Badge tone={statusTone(o.status)} dot>
          {o.status.replace('_', ' ')}
        </Badge>
      ),
    },
    { key: 'product', header: 'Product', render: (o) => o.product ?? '—' },
    {
      key: 'invoiced',
      header: 'Invoiced',
      render: (o) => (
        <Badge tone={o.invoices.length > 0 ? 'success' : 'neutral'}>
          {o.invoices.length > 0 ? 'Yes' : 'No'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Confirmed orders moving through fulfillment and invoicing." />

      <DataTable
        columns={columns}
        rows={orders}
        rowKey={(o) => o.id}
        empty={<EmptyState icon={Package} title="No orders yet" description="Orders appear here once a quote is accepted." />}
      />
    </div>
  );
}
