import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getProduct } from '@/actions/products';

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) {
    return <p className="text-sm text-muted">You do not have access to products.</p>;
  }

  const product = await getProduct(tenantId, id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{product.name}</h1>
        <p className="font-mono text-sm text-muted">{product.sku}</p>
        <p className="text-sm text-muted">{product.category ?? 'Uncategorized'} · {product.uom} {product.hsCode ? `· HS ${product.hsCode.hsCode}` : ''}</p>
      </div>

      {product.description && <p className="text-sm text-ink-soft">{product.description}</p>}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Price list entries</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Price list</th>
                <th className="px-4 py-3">Incoterm</th>
                <th className="px-4 py-3">Unit price</th>
                <th className="px-4 py-3">MOQ</th>
              </tr>
            </thead>
            <tbody>
              {product.priceListItems.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3 text-ink">{item.priceList.name}</td>
                  <td className="px-4 py-3 text-muted">{item.incoterm}</td>
                  <td className="px-4 py-3 text-muted">{item.priceList.currency} {item.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-muted">{item.moq ?? '—'}</td>
                </tr>
              ))}
              {product.priceListItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">Not on any price list yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
