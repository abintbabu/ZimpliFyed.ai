import { Ship } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listForwarders } from '@/actions/forwarders';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { ForwarderForm, ForwarderToggle } from './forwarder-form';

export const metadata = { title: 'Forwarders' };
export const dynamic = 'force-dynamic';

export default async function ForwardersPage() {
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return <p className="text-sm text-muted">You do not have access to forwarders.</p>;
  const canWrite = hasPermission(role, 'vendors:write');
  const rows = await listForwarders();

  return (
    <div className="space-y-6">
      <PageHeader title="Forwarders" description="Freight forwarders and carriers you quote with. Quotes entered under a matching name link here automatically." />
      {canWrite && <ForwarderForm />}
      {rows.length === 0 ? (
        <EmptyState icon={Ship} title="No forwarders yet" description="Add the forwarders you work with to track their quotes and transit times." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3 text-right">Quotes</th><th className="px-4 py-3 text-right">Accepted</th><th className="px-4 py-3 text-right">Avg transit</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id} className={`border-t border-line ${f.active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3 font-medium text-ink">{f.name}</td>
                  <td className="px-4 py-3 text-muted">{[f.contactName, f.email, f.phone].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.quotes}</td><td className="px-4 py-3 text-right tabular-nums">{f.accepted}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.avgTransitDays == null ? '—' : `${f.avgTransitDays} d`}</td>
                  <td className="px-4 py-3 text-right">{canWrite && <ForwarderToggle id={f.id} active={f.active} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
