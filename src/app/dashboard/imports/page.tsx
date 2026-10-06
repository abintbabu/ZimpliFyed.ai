import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { listImportEntries } from '@/actions/imports';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewImportForm } from './new-import-form';

export const metadata = { title: 'Imports' };
export const dynamic = 'force-dynamic';

export default async function ImportsPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return <p className="text-sm text-muted">You do not have access to imports.</p>;
  const canWrite = hasPermission(role, 'vendors:write');
  const [entries, vendors] = await Promise.all([listImportEntries(), canWrite ? prisma.vendor.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <PageHeader title="Imports" description="Bill-of-entry costing: customs valuation, duties and the true landed cost of each imported line." />
      {canWrite && <NewImportForm vendors={vendors} />}
      {entries.length === 0 ? <EmptyState icon={PackageOpen} title="No import entries yet" description="Create an entry to work out what an imported consignment really costs." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Entry</th><th className="px-4 py-3">BOE</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Lines</th><th className="px-4 py-3 text-right">Goods value</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-3"><Link href={`/dashboard/imports/${e.id}`} className="font-medium text-ink hover:text-brand">{e.entryNumber}</Link></td>
                  <td className="px-4 py-3 text-muted">{e.boeNumber ?? '—'}</td><td className="px-4 py-3 capitalize text-muted">{e.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.lines.length}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.currency} {e.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
