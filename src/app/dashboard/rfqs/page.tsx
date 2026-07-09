import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listVendorRfqs } from '@/actions/vendor-rfqs';
import { listVendors } from '@/actions/vendors';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewRfqForm } from './new-rfq-form';

const STATUS_LABEL: Record<string, string> = { open: 'Open', awarded: 'Awarded', closed: 'Closed' };

type Rfq = Awaited<ReturnType<typeof listVendorRfqs>>[number];

export default async function VendorRfqsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) {
    return <p className="text-sm text-muted">You do not have access to RFQs.</p>;
  }

  const canWrite = hasPermission(role, 'vendors:write');
  const [rfqs, vendors] = await Promise.all([listVendorRfqs(tenantId), listVendors(tenantId)]);

  const columns: DataTableColumn<Rfq>[] = [
    {
      key: 'rfqNumber',
      header: 'RFQ',
      render: (r) => (
        <Link href={`/dashboard/rfqs/${r.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {r.rfqNumber} — {r.title}
        </Link>
      ),
    },
    { key: 'invites', header: 'Vendors invited', numeric: true, render: (r) => r.invites.length },
    { key: 'quotes', header: 'Quotes in', numeric: true, render: (r) => r.quotes.length },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={statusTone(r.status)} dot>
          {STATUS_LABEL[r.status]}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor RFQs"
        actions={canWrite && <NewRfqForm vendors={vendors.map((v) => ({ id: v.id, name: v.name }))} />}
      />

      <DataTable
        columns={columns}
        rows={rfqs}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No RFQs yet"
            description="Broadcast an RFQ to your shortlisted vendors to compare quotes."
            action={canWrite && <NewRfqForm vendors={vendors.map((v) => ({ id: v.id, name: v.name }))} />}
          />
        }
      />
    </div>
  );
}
