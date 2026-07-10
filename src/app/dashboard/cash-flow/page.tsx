import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { buildCashFlowForecast } from '@/lib/cash-flow-forecast';

export const metadata = { title: 'Cash flow' };
export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'analytics:read')) redirect('/dashboard');

  const forecast = await buildCashFlowForecast(tenantId);
  const primaryCurrency = forecast.receivablesCurrencies[0] ?? 'USD';
  const mixedCurrencies = forecast.receivablesCurrencies.length > 1;
  const maxBucket = Math.max(1, ...forecast.buckets.map((b) => b.receivables));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Cash flow</h1>
        <p className="mt-1 text-sm text-muted">Expected inflows over the next six weeks, from invoice due dates and claimable incentives.</p>
      </div>

      {mixedCurrencies && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          Receivables span {forecast.receivablesCurrencies.join(', ')} — totals below are a simple sum, not FX-converted.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Overdue now" value={forecast.overdueReceivables} currency={primaryCurrency} danger />
        <Tile label="Scheduled (6 weeks)" value={forecast.scheduledReceivablesTotal - forecast.overdueReceivables} currency={primaryCurrency} />
        <Tile label="Incentives pipeline" value={forecast.incentivesPipeline} currency="INR" />
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-muted uppercase tracking-wide">Receivables by week</h2>
        <div className="space-y-3">
          {forecast.buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-xs text-muted">{b.label}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface">
                <div
                  className="h-full rounded-md bg-brand/70"
                  style={{ width: `${(b.receivables / maxBucket) * 100}%` }}
                />
              </div>
              <span className="w-28 shrink-0 text-right text-sm tabular-nums text-ink">
                {primaryCurrency} {b.receivables.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Bucketed by each invoice&apos;s due date; invoices without a due date aren&apos;t scheduled here. Vendor dues
          aren&apos;t tracked yet — this is inflows only.
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, currency, danger }: { label: string; value: number; currency: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${danger && value > 0 ? 'text-danger' : 'text-ink'}`}>
        {currency} {value.toFixed(2)}
      </p>
    </div>
  );
}
