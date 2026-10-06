'use client';

import { useMemo, useState } from 'react';
import { compareFreightQuotes, type FreightQuoteRow, type FreightMode } from '@/lib/freight-compare';

/** Side-by-side freight quotes in one currency, per chargeable unit, cheapest/fastest flagged. */
export function FreightComparisonPanel({ quotes, mode, cbm, weightKg, rates, currencies }: {
  quotes: (Omit<FreightQuoteRow, 'validTo'> & { validTo: string | null })[];
  mode: FreightMode; cbm: number | null; weightKg: number | null; rates: Record<string, number>; currencies: string[];
}) {
  const [currency, setCurrency] = useState(currencies[0] ?? 'USD');
  const now = useMemo(() => new Date(), []);
  const result = useMemo(
    () => compareFreightQuotes({ quotes: quotes.map((q) => ({ ...q, validTo: q.validTo ? new Date(q.validTo) : null })), mode, cbm, weightKg, currency, rates, now }),
    [quotes, mode, cbm, weightKg, currency, rates, now],
  );
  if (quotes.length < 2) return null;
  const unitLabel = result.basis.unit === 'shipment' ? 'per shipment' : `per ${result.basis.unit.toUpperCase()}`;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Compare quotes</h2>
        <label className="text-xs text-muted">in <select aria-label="Comparison currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded border border-line px-2 py-1 text-xs text-ink">{currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
      </div>
      <p className="text-xs text-muted">
        {result.basis.unit === 'shipment' ? 'No cargo size recorded — comparing all-in totals only.' : `Chargeable ${result.basis.quantity} ${result.basis.unit.toUpperCase()}${mode === 'air' ? ' (greater of actual and volumetric weight)' : ' (greater of volume and weight)'}.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">#</th><th className="pb-1 pr-2">Forwarder</th><th className="pb-1 pr-2 text-right">All-in ({currency})</th><th className="pb-1 pr-2 text-right">{unitLabel}</th><th className="pb-1 pr-2 text-right">Transit</th><th className="pb-1" /></tr></thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id} className={`border-t border-line ${r.rankable ? '' : 'text-muted'}`}>
                <td className="py-1.5 pr-2">{r.rank ?? '—'}</td>
                <td className="py-1.5 pr-2 text-ink">{r.forwarderName}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.total == null ? '—' : r.total.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.perUnit == null ? '—' : r.perUnit.toFixed(2)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{r.transitDays == null ? '—' : `${r.transitDays} d`}</td>
                <td className="py-1.5 text-xs">
                  {r.isCheapest && <span className="mr-1 rounded bg-green-100 px-1.5 py-0.5 text-green-800">cheapest</span>}
                  {r.isFastest && <span className="mr-1 rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">fastest</span>}
                  {r.problems.map((p, i) => <span key={i} className="block text-amber-800">{p}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
