import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listFxRates } from '@/actions/fx';
import { FxForm } from './fx-form';

export const metadata = { title: 'Exchange rates' };
export const dynamic = 'force-dynamic';

export default async function FxSettingsPage() {
  const { role } = await requireTenantSession();
  const data = await listFxRates();
  if (!data) return <p className="text-sm text-muted">You do not have access to exchange rates.</p>;
  const canManage = hasPermission(role, 'settings:manage');
  const rows = Object.entries(data.rates).filter(([c]) => c !== data.baseCurrency);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/dashboard/settings" className="text-xs text-brand hover:underline">← Settings</Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Exchange rates</h1>
        <p className="mt-1 text-sm text-muted">
          Rates you enter here convert foreign-currency receivables into {data.baseCurrency} on the cash-flow forecast. There is no live
          feed — a currency with no rate is left out of converted totals and called out, never estimated.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="mb-3 text-sm font-semibold text-ink">Current rates</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No rates yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {rows.map(([currency, rate]) => (
              <li key={currency} className="flex justify-between py-2"><span className="text-ink">1 {currency}</span><span className="tabular-nums text-ink">{rate} {data.baseCurrency}</span></li>
            ))}
          </ul>
        )}
        {canManage && <div className="mt-5 border-t border-line pt-4"><FxForm baseCurrency={data.baseCurrency} /></div>}
      </div>

      {data.history.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="mb-3 text-sm font-semibold text-ink">Recent changes</p>
          <ul className="divide-y divide-line text-xs text-muted">
            {data.history.map((h) => (
              <li key={h.id} className="flex justify-between py-1.5"><span>{h.currency} → {h.rateToBase} {data.baseCurrency}</span><span>{new Date(h.asOf).toISOString().slice(0, 10)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
