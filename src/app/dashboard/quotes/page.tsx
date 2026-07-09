import Link from 'next/link';
import { FileText } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listQuotes } from '@/actions/quotes';
import { listBuyers } from '@/actions/buyers';
import { listProducts } from '@/actions/products';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewQuoteForm } from './new-quote-form';

type Quote = Awaited<ReturnType<typeof listQuotes>>[number];

export default async function QuotesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:read')) {
    return <p className="text-sm text-muted">You do not have access to quotes.</p>;
  }

  const canWrite = hasPermission(role, 'quotes:write');
  const [quotes, buyers, products] = await Promise.all([
    listQuotes(tenantId),
    canWrite ? listBuyers(tenantId) : Promise.resolve([]),
    canWrite ? listProducts(tenantId) : Promise.resolve([]),
  ]);

  const columns: DataTableColumn<Quote>[] = [
    {
      key: 'quoteNumber',
      header: 'Quote #',
      render: (q) => (
        <Link href={`/dashboard/quotes/${q.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {q.quoteNumber}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (q) => (
        <Badge tone={statusTone(q.status)} dot>
          {q.status}
        </Badge>
      ),
    },
    { key: 'total', header: 'Total', numeric: true, render: (q) => `${q.currency} ${q.total.toFixed(2)}` },
    {
      key: 'margin',
      header: 'Margin %',
      numeric: true,
      render: (q) => (q.overallMarginPct != null ? `${q.overallMarginPct}%` : '—'),
    },
    { key: 'order', header: 'Order', render: (q) => (q.orderId ? 'Linked' : '—') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotes"
        actions={
          canWrite && (
            <NewQuoteForm
              buyers={buyers.map((b) => ({ id: b.id, name: b.name }))}
              products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))}
              canOverrideMarginFloor={role === 'admin' || role === 'super_admin'}
            />
          )
        }
      />

      <DataTable
        columns={columns}
        rows={quotes}
        rowKey={(q) => q.id}
        empty={<EmptyState icon={FileText} title="No quotes yet" description="Quotes you create for buyers will appear here." />}
      />
    </div>
  );
}
