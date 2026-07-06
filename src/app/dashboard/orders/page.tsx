import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listOrders } from '@/actions/orders';

export default async function OrdersPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) {
    return <p className="text-sm text-muted">You do not have access to orders.</p>;
  }

  const orders = await listOrders(tenantId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Orders</h1>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Invoiced</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/orders/${o.id}`} className="font-medium text-ink hover:underline">{o.orderNumber}</Link>
                </td>
                <td className="px-4 py-3 text-muted capitalize">{o.status.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-muted">{o.product ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{o.invoices.length > 0 ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No orders yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
