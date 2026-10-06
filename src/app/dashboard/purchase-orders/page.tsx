import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listPurchaseOrders } from '@/actions/purchase-orders';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';

export const metadata = { title: 'Purchase orders' };
export const dynamic = 'force-dynamic';

type Po = Awaited<ReturnType<typeof listPurchaseOrders>>[number];

export default async function PurchaseOrdersPage() {
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return <p className="text-sm text-muted">You do not have access to purchase orders.</p>;
  const pos = await listPurchaseOrders();

  const columns: DataTableColumn<Po>[] = [
    { key: 'po', header: 'PO #', render: (p) => <Link href={`/dashboard/purchase-orders/${p.id}`} className="font-medium text-ink transition-colors hover:text-brand">{p.poNumber}</Link> },
    { key: 'vendor', header: 'Vendor', render: (p) => p.vendor.name },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={p.status === 'cancelled' ? 'neutral' : p.status === 'received' ? 'success' : 'info'} dot>{p.status}</Badge> },
    { key: 'delivery', header: 'Deliver by', render: (p) => (p.deliveryDate ? p.deliveryDate.toISOString().slice(0, 10) : '—') },
    { key: 'total', header: 'Total', align: 'right' as const, render: (p) => `${p.currency} ${p.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Purchase orders" description="Raised from awarded vendor RFQs." />
      <DataTable
        columns={columns}
        rows={pos}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={ClipboardList} title="No purchase orders yet" description="Award a vendor RFQ, then raise a purchase order from it." />}
      />
    </div>
  );
}
