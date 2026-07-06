import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listInvoices } from '@/actions/invoices';

function isOverdue(dueDate: Date | null, balanceDue: number, isCreditOrDebitNote: boolean) {
  return !isCreditOrDebitNote && balanceDue > 0 && !!dueDate && dueDate.getTime() < Date.now();
}

export default async function InvoicesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:read')) {
    return <p className="text-sm text-muted">You do not have access to invoices.</p>;
  }

  const invoices = await listInvoices(tenantId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Invoices</h1>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Balance due</th>
              <th className="px-4 py-3">Due date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-ink hover:underline">{inv.invoiceNumber}</Link>
                </td>
                <td className="px-4 py-3 text-muted capitalize">{inv.status}</td>
                <td className="px-4 py-3 text-muted">
                  {inv.currency} {inv.balanceDue.toFixed(2)}
                  {isOverdue(inv.dueDate, inv.balanceDue, inv.isCreditOrDebitNote) && (
                    <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">overdue</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{inv.dueDate ? inv.dueDate.toLocaleDateString() : '—'}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No invoices yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
