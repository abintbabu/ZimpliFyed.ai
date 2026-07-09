import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listBuyers } from '@/actions/buyers';
import { NewBuyerForm } from './new-buyer-form';

export default async function BuyersPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'customers:read')) {
    return <p className="text-sm text-muted">You do not have access to buyers.</p>;
  }

  const canWrite = hasPermission(role, 'customers:write');
  const buyers = await listBuyers(tenantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Buyers</h1>
        {canWrite && <NewBuyerForm />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Contacts</th>
              <th className="px-4 py-3">Quotes</th>
              <th className="px-4 py-3">Orders</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/buyers/${b.id}`} className="font-medium text-ink hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{b.country ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{b.contacts.length}</td>
                <td className="px-4 py-3 text-muted">{b._count.quotes}</td>
                <td className="px-4 py-3 text-muted">{b._count.orders}</td>
              </tr>
            ))}
            {buyers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No buyers yet. Convert a lead or create one directly.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
