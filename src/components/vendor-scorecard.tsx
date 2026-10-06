import type { Scorecard } from '@/lib/scorecard';

const GRADE_CLASS: Record<string, string> = { A: 'bg-green-100 text-green-800', B: 'bg-blue-100 text-blue-800', C: 'bg-amber-100 text-amber-800', D: 'bg-red-100 text-red-800' };

export function VendorScorecard({ card }: { card: Scorecard }) {
  const pct = (n: number | null) => (n == null ? '—' : `${n}%`);
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Supplier scorecard</h2>
        {card.grade && <span className={`rounded px-2 py-0.5 text-sm font-semibold ${GRADE_CLASS[card.grade]}`}>{card.grade} · {card.score}</span>}
      </div>
      {!card.enoughData && <p className="text-xs text-muted">Not enough history for a grade yet — it needs at least 3 issued purchase orders with delivery or quality data. Figures below are shown for reference.</p>}
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div><dt className="text-xs text-muted">Orders</dt><dd className="text-ink">{card.orders}</dd></div>
        <div><dt className="text-xs text-muted">On-time delivery</dt><dd className="text-ink">{pct(card.onTimePct)}{card.measuredDeliveries > 0 && <span className="text-xs text-muted"> of {card.measuredDeliveries}</span>}</dd></div>
        <div><dt className="text-xs text-muted">Avg delay when late</dt><dd className="text-ink">{card.avgDelayDays == null ? '—' : `${card.avgDelayDays} d`}</dd></div>
        <div><dt className="text-xs text-muted">Rejected</dt><dd className="text-ink">{pct(card.rejectionPct)}</dd></div>
        <div><dt className="text-xs text-muted">Price trend</dt><dd className="text-ink">{card.priceTrendPct == null ? '—' : `${card.priceTrendPct > 0 ? '+' : ''}${card.priceTrendPct}%`}</dd></div>
      </dl>
    </section>
  );
}
