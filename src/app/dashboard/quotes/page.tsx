import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listQuotes } from '@/actions/quotes';
import { NewQuoteForm } from './new-quote-form';

export default async function QuotesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'quotes:read')) {
    return <p className="text-sm text-muted">You do not have access to quotes.</p>;
  }

  const canWrite = hasPermission(role, 'quotes:write');
  const quotes = await listQuotes(tenantId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Quotes</h1>
        {canWrite && <NewQuoteForm />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Quote #</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Margin %</th>
              <th className="px-4 py-3">Order</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/quotes/${q.id}`} className="font-medium text-ink hover:underline">{q.quoteNumber}</Link>
                </td>
                <td className="px-4 py-3 text-muted capitalize">{q.status}</td>
                <td className="px-4 py-3 text-muted">{q.currency} {q.total.toFixed(2)}</td>
                <td className="px-4 py-3 text-muted">{q.overallMarginPct != null ? `${q.overallMarginPct}%` : '—'}</td>
                <td className="px-4 py-3 text-muted">{q.orderId ? 'Linked' : '—'}</td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No quotes yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
