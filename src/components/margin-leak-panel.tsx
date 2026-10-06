import type { MarginLeakReport } from '@/lib/margin-leak';

const fmt = (n: number, c: string) => `${n < 0 ? '−' : ''}${c} ${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Server-rendered: where this order's margin went, as amounts that sum to the gap. */
export function MarginLeakPanel({ report }: { report: MarginLeakReport & { currency: string } | null }) {
  if (!report || report.leaks.length === 0 && report.gapPts == null) return null;
  const c = report.currency;
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Where the margin went</h2>
        {report.flagged && <span role="status" className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{report.gapPts} pts below quote</span>}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">Quoted profit</dt><dd className="text-ink">{fmt(report.quotedProfit, c)}{report.quotedMarginPct != null && <span className="text-xs text-muted"> · {report.quotedMarginPct}%</span>}</dd></div>
        <div><dt className="text-xs text-muted">Actual profit so far</dt><dd className="text-ink">{fmt(report.actualProfit, c)}{report.actualMarginPct != null && <span className="text-xs text-muted"> · {report.actualMarginPct}%</span>}</dd></div>
        <div><dt className="text-xs text-muted">Gap</dt><dd className={report.gap > 0 ? 'font-semibold text-danger' : 'text-ink'}>{fmt(report.gap, c)}</dd></div>
      </dl>
      {report.leaks.length === 0 ? <p className="text-sm text-muted">Nothing has leaked — actuals match the quote.</p> : (
        <ul className="divide-y divide-line text-sm">
          {report.leaks.map((l) => (
            <li key={l.key} className="flex justify-between py-1.5"><span className="text-ink">{l.label}</span><span className={`tabular-nums ${l.amount > 0 ? 'text-danger' : 'text-green-700'}`}>{l.amount > 0 ? '−' : '+'} {fmt(Math.abs(l.amount), c).replace('−', '')}</span></li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">&ldquo;Billed less than quoted&rdquo; may simply be an invoice not raised yet. Landed cost comes from the cost sheet when one exists.</p>
    </section>
  );
}
