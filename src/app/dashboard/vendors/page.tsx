import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listVendors } from '@/actions/vendors';
import { NewVendorForm } from './new-vendor-form';

export default async function VendorsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) {
    return <p className="text-sm text-muted">You do not have access to vendors.</p>;
  }

  const canWrite = hasPermission(role, 'vendors:write');
  const vendors = await listVendors(tenantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Vendors</h1>
        {canWrite && <NewVendorForm />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Rates</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/vendors/${v.id}`} className="font-medium text-ink hover:underline">
                    {v.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{v.contactName ?? v.email ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{v.rates.length}</td>
              </tr>
            ))}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted">No vendors yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
