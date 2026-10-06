import { Boxes } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listStock } from '@/actions/stock';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewStockItemForm, MovementForm } from './stock-forms';

export const metadata = { title: 'Stock' };
export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'products:read')) return <p className="text-sm text-muted">You do not have access to stock.</p>;
  const canWrite = hasPermission(role, 'products:write');
  const { items, lowCount } = await listStock();

  return (
    <div className="space-y-6">
      <PageHeader title="Stock" description="Quantities on hand, from recorded movements. Goods receipts on purchase orders add stock automatically." />
      {lowCount > 0 && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{lowCount} item{lowCount > 1 ? 's are' : ' is'} at or below the reorder level.</p>}
      {canWrite && <NewStockItemForm />}
      {items.length === 0 ? <EmptyState icon={Boxes} title="No stock items yet" description="Add the items you hold, then record receipts and issues against them." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Item</th><th className="px-4 py-3">Location</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reorder at</th><th className="px-4 py-3">Move stock</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs text-muted">{i.sku}</td><td className="px-4 py-3 text-ink">{i.name}</td><td className="px-4 py-3 text-muted">{i.location}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${i.low ? 'font-semibold text-danger' : 'text-ink'}`}>{i.onHand} {i.uom}{i.low && <span className="ml-1 text-xs">low</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{i.reorderLevel ?? '—'}</td>
                  <td className="px-4 py-3"><MovementForm itemId={i.id} canWrite={canWrite} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
