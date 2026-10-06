import { Receipt } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { listVendorBills } from '@/actions/payables';
import { latestRates, planReporting } from '@/lib/fx';
import { receivablesAgeing } from '@/lib/analytics';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewBillForm, PayBillForm } from './payables-forms';

export const metadata = { title: 'Payables' };
export const dynamic = 'force-dynamic';

export default async function PayablesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return <p className="text-sm text-muted">You do not have access to payables.</p>;
  const canWrite = hasPermission(role, 'vendors:write');
  const [bills, vendors, fx] = await Promise.all([
    listVendorBills(),
    canWrite ? prisma.vendor.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 }),
  ]);

  const open = bills.filter((b) => b.status !== 'void' && b.status !== 'paid');
  const plan = planReporting(open.map((b) => b.currency), latestRates(fx));
  // Same ageing as receivables: a bill's outstanding balance, aged by days past its due date.
  const ageing = receivablesAgeing(open.map((b) => ({ total: b.total, balanceDue: b.balance, currency: b.currency, status: 'sent', dueDate: b.dueDate, createdAt: b.billDate, isCreditOrDebitNote: false })), new Date(), plan);
  const fmt = (n: number, c: string) => `${c} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Payables" description="Supplier bills and what you still owe. A bill's status follows its payments." />
      {open.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">Owed to suppliers: {fmt(ageing.total, plan.reportingCurrency)}</p>
          {ageing.excludedCount > 0 && <p role="alert" className="mt-1 text-xs text-amber-800">{ageing.excludedCount} bill(s) in a currency with no exchange rate are left out of this total.</p>}
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">{ageing.buckets.filter((b) => b.count > 0).map((b) => <span key={b.key}>{b.label}: <span className="text-ink">{fmt(b.amount, plan.reportingCurrency)}</span> ({b.count})</span>)}</div>
        </div>
      )}
      {canWrite && <NewBillForm vendors={vendors} />}
      {bills.length === 0 ? <EmptyState icon={Receipt} title="No supplier bills yet" description="Record the bills your suppliers send so you can see what you owe and when." /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Bill</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Pay</th></tr></thead>
            <tbody>
              {bills.map((b) => {
                const overdue = b.balance > 0 && b.dueDate && b.dueDate < new Date();
                return (
                  <tr key={b.id} className={`border-t border-line ${b.status === 'void' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{b.billNumber}{b.purchaseOrder && <span className="ml-1 text-muted">· {b.purchaseOrder.poNumber}</span>}</td>
                    <td className="px-4 py-3 text-ink">{b.vendor.name}</td>
                    <td className={`px-4 py-3 ${overdue ? 'font-medium text-danger' : 'text-muted'}`}>{b.dueDate ? b.dueDate.toISOString().slice(0, 10) : '—'}{overdue && ' overdue'}</td>
                    <td className="px-4 py-3 capitalize text-muted">{b.status.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(b.total, b.currency)}</td><td className="px-4 py-3 text-right tabular-nums">{b.balance > 0 ? fmt(b.balance, b.currency) : '—'}</td>
                    <td className="px-4 py-3">{canWrite && b.balance > 0 && <PayBillForm billId={b.id} balance={b.balance} canVoid={b.payments.length === 0} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
