import { Landmark } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listBankLines } from '@/actions/bank';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { ImportForm, LineActions } from './bank-client';

export const metadata = { title: 'Bank reconciliation' };
export const dynamic = 'force-dynamic';

export default async function BankPage() {
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:read')) return <p className="text-sm text-muted">You do not have access to bank reconciliation.</p>;
  const canWrite = hasPermission(role, 'invoices:write');
  const lines = await listBankLines();
  const pending = lines.filter((l) => l.matchStatus === 'suggested' || l.matchStatus === 'unmatched').length;
  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <PageHeader title="Bank reconciliation" description="Match bank credits to invoices and debits to supplier bills." />
      {canWrite && <ImportForm />}
      {lines.length === 0 ? <EmptyState icon={Landmark} title="No statement lines yet" description="Import a bank statement CSV to start matching." /> : (
        <>
          <p className="text-sm text-muted">{pending} line(s) waiting for review.</p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Narration</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Match</th><th className="px-4 py-3" /></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className={`border-t border-line align-top ${l.matchStatus === 'ignored' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{l.txnDate.toISOString().slice(0, 10)}</td>
                    <td className="px-4 py-3 text-ink">{l.narration}{l.reference && <span className="block text-xs text-muted">{l.reference}</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${l.amount < 0 ? 'text-danger' : 'text-ink'}`}>{l.currency} {fmt(l.amount)}</td>
                    <td className="px-4 py-3 text-xs">
                      {l.target ? <><span className="font-medium text-ink">{l.target.kind === 'invoice' ? 'Invoice' : 'Bill'} {l.target.number}</span><span className="block text-muted">{l.matchNote}</span></> : <span className="capitalize text-muted">{l.matchStatus}</span>}
                      {l.matchStatus === 'confirmed' && <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-green-800">confirmed</span>}
                    </td>
                    <td className="px-4 py-3">{canWrite && <LineActions id={l.id} status={l.matchStatus} needsForeignAmount={!!l.target && l.target.currency.toUpperCase() !== l.currency.toUpperCase()} docCurrency={l.target?.currency ?? null} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
