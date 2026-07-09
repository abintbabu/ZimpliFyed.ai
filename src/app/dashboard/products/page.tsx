import Link from 'next/link';
import { Boxes } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listProducts } from '@/actions/products';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewProductForm } from './new-product-form';

type Product = Awaited<ReturnType<typeof listProducts>>[number];

export default async function ProductsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) {
    return <p className="text-sm text-muted">You do not have access to products.</p>;
  }

  const canWrite = hasPermission(role, 'products:write');
  const products = await listProducts(tenantId);

  const columns: DataTableColumn<Product>[] = [
    { key: 'sku', header: 'SKU', render: (p) => <span className="font-mono text-xs text-muted">{p.sku}</span> },
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <Link href={`/dashboard/products/${p.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {p.name}
        </Link>
      ),
    },
    { key: 'category', header: 'Category', render: (p) => p.category ?? '—' },
    { key: 'hsCode', header: 'HS code', render: (p) => p.hsCode?.hsCode ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <Badge tone={p.active ? 'success' : 'neutral'} dot>
          {p.active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Products" actions={canWrite && <NewProductForm />} />

      <DataTable
        columns={columns}
        rows={products}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={Boxes}
            title="No products yet"
            description="Add products to start building quotes and orders."
            action={canWrite && <NewProductForm />}
          />
        }
      />
    </div>
  );
}
