import type { OrderPnlResult } from '@/lib/order-pnl';

export function OrderPnlPanel({ pnl, currency }: { pnl: OrderPnlResult; currency: string }) {
  const marginDelta = pnl.quotedMarginPct != null && pnl.actualMarginPct != null
    ? parseFloat((pnl.actualMarginPct - pnl.quotedMarginPct).toFixed(2))
    : null;

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Order P&L</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted">Quoted revenue</p>
          <p className="text-lg font-semibold text-ink">{currency} {pnl.quotedRevenue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Quoted margin</p>
          <p className="text-lg font-semibold text-ink">{pnl.quotedMarginPct != null ? `${pnl.quotedMarginPct}%` : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Actual revenue (invoiced)</p>
          <p className="text-lg font-semibold text-ink">{currency} {pnl.actualRevenue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Actual margin{pnl.hasCostSheet ? ' (landed)' : ''}</p>
          <p className={`text-lg font-semibold ${
            marginDelta != null ? (marginDelta < 0 ? 'text-red-600' : 'text-green-700') : 'text-ink'
          }`}>
            {pnl.actualMarginPct != null ? `${pnl.actualMarginPct}%` : '—'}
            {marginDelta != null && (
              <span className="ml-1 text-xs font-normal text-muted">
                ({marginDelta >= 0 ? '+' : ''}{marginDelta}pp vs quoted)
              </span>
            )}
          </p>
        </div>
      </div>

      {pnl.incentiveCredits > 0 && (
        <p className="mt-3 text-xs text-muted">
          Includes {currency} {pnl.incentiveCredits.toFixed(2)} in claimed/received export incentive credits.
        </p>
      )}

      {!pnl.hasCostSheet && (
        <p className="mt-3 text-xs text-muted">
          No cost sheet on the quote — actual margin uses the quote&apos;s flat line costs. Add a cost sheet for true landed-cost margin.
        </p>
      )}

      <p className="mt-2 text-xs text-muted">
        Forex variance isn&apos;t tracked yet — figures assume booked and realized rates match.
      </p>
    </section>
  );
}
