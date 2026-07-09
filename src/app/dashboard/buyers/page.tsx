import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listBuyers } from '@/actions/buyers';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewBuyerForm } from './new-buyer-form';

type Buyer = Awaited<ReturnType<typeof listBuyers>>[number];

export default async function BuyersPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'customers:read')) {
    return <p className="text-sm text-muted">You do not have access to buyers.</p>;
  }

  const canWrite = hasPermission(role, 'customers:write');
  const buyers = await listBuyers(tenantId);

  const columns: DataTableColumn<Buyer>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (b) => (
        <Link href={`/dashboard/buyers/${b.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {b.name}
        </Link>
      ),
    },
    { key: 'country', header: 'Country', render: (b) => b.country ?? '—' },
    { key: 'contacts', header: 'Contacts', numeric: true, render: (b) => b.contacts.length },
    { key: 'quotes', header: 'Quotes', numeric: true, render: (b) => b._count.quotes },
    { key: 'orders', header: 'Orders', numeric: true, render: (b) => b._count.orders },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Buyers" description="Your customer accounts and their deal history." actions={canWrite && <NewBuyerForm />} />

      <DataTable
        columns={columns}
        rows={buyers}
        rowKey={(b) => b.id}
        empty={
          <EmptyState
            icon={Building2}
            title="No buyers yet"
            description="Convert a lead or create a buyer directly."
            action={canWrite && <NewBuyerForm />}
          />
        }
      />
    </div>
  );
}
