import Link from 'next/link';
import { Truck } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listVendors } from '@/actions/vendors';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewVendorForm } from './new-vendor-form';

type Vendor = Awaited<ReturnType<typeof listVendors>>[number];

export default async function VendorsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) {
    return <p className="text-sm text-muted">You do not have access to vendors.</p>;
  }

  const canWrite = hasPermission(role, 'vendors:write');
  const vendors = await listVendors(tenantId);

  const columns: DataTableColumn<Vendor>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (v) => (
        <Link href={`/dashboard/vendors/${v.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {v.name}
        </Link>
      ),
    },
    { key: 'contact', header: 'Contact', render: (v) => v.contactName ?? v.email ?? '—' },
    { key: 'rates', header: 'Rates', numeric: true, render: (v) => v.rates.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Vendors" actions={canWrite && <NewVendorForm />} />

      <DataTable
        columns={columns}
        rows={vendors}
        rowKey={(v) => v.id}
        empty={
          <EmptyState
            icon={Truck}
            title="No vendors yet"
            description="Add vendors to start sourcing quotes and RFQs."
            action={canWrite && <NewVendorForm />}
          />
        }
      />
    </div>
  );
}
