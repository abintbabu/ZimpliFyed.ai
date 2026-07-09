import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listProducts } from '@/actions/products';
import { NewProductForm } from './new-product-form';

export default async function ProductsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) {
    return <p className="text-sm text-muted">You do not have access to products.</p>;
  }

  const canWrite = hasPermission(role, 'products:write');
  const products = await listProducts(tenantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Products</h1>
        {canWrite && <NewProductForm />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">HS code</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs text-muted">{p.sku}</td>
                <td className="px-4 py-3">
                  <Link href={`/dashboard/products/${p.id}`} className="font-medium text-ink hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{p.category ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{p.hsCode?.hsCode ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{p.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No products yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
