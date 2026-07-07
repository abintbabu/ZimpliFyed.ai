import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listVendorRfqs } from '@/actions/vendor-rfqs';
import { listVendors } from '@/actions/vendors';
import { NewRfqForm } from './new-rfq-form';

const STATUS_LABEL: Record<string, string> = { open: 'Open', awarded: 'Awarded', closed: 'Closed' };

export default async function VendorRfqsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) {
    return <p className="text-sm text-muted">You do not have access to RFQs.</p>;
  }

  const canWrite = hasPermission(role, 'vendors:write');
  const [rfqs, vendors] = await Promise.all([listVendorRfqs(tenantId), listVendors(tenantId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Vendor RFQs</h1>
        {canWrite && <NewRfqForm vendors={vendors.map((v) => ({ id: v.id, name: v.name }))} />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">RFQ</th>
              <th className="px-4 py-3">Vendors invited</th>
              <th className="px-4 py-3">Quotes in</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rfqs.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/rfqs/${r.id}`} className="font-medium text-ink hover:underline">
                    {r.rfqNumber} — {r.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{r.invites.length}</td>
                <td className="px-4 py-3 text-muted">{r.quotes.length}</td>
                <td className="px-4 py-3 text-muted capitalize">{STATUS_LABEL[r.status]}</td>
              </tr>
            ))}
            {rfqs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No RFQs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
