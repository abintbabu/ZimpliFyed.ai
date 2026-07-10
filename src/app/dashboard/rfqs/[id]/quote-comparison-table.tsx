'use client';

import { useTransition } from 'react';
import { awardVendorRfq } from '@/actions/vendor-rfqs';

type QuoteRow = {
  id: string;
  vendorName: string;
  rate: number;
  incoterm: string;
  landedCostPerUnit: number;
  moqPieces: number | null;
  leadTimeDays: number | null;
  notes: string | null;
};

export function QuoteComparisonTable({
  rfqId,
  quotes,
  awardedQuoteId,
  canWrite,
}: {
  rfqId: string;
  quotes: QuoteRow[];
  awardedQuoteId: string | null;
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const lowestLandedCost = quotes.length ? Math.min(...quotes.map((q) => q.landedCostPerUnit)) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Quoted rate</th>
            <th className="px-4 py-3">Landed cost / unit</th>
            <th className="px-4 py-3">MOQ</th>
            <th className="px-4 py-3">Lead time</th>
            <th className="px-4 py-3">Notes</th>
            {canWrite && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id} className={`border-t border-line ${q.id === awardedQuoteId ? 'bg-green-50' : ''}`}>
              <td className="px-4 py-3 font-medium text-ink">
                {q.vendorName}
                {q.id === awardedQuoteId && <span className="ml-2 text-xs font-semibold text-green-700">Awarded</span>}
              </td>
              <td className="px-4 py-3 text-ink">
                {q.rate} <span className="text-xs text-muted">({q.incoterm})</span>
              </td>
              <td className={`px-4 py-3 ${q.landedCostPerUnit === lowestLandedCost ? 'font-semibold text-green-700' : 'text-ink'}`}>
                {q.landedCostPerUnit}
                {q.landedCostPerUnit === lowestLandedCost && <span className="ml-2 text-xs font-medium text-green-700">Lowest</span>}
              </td>
              <td className="px-4 py-3 text-muted">{q.moqPieces ?? '—'}</td>
              <td className="px-4 py-3 text-muted">{q.leadTimeDays ? `${q.leadTimeDays}d` : '—'}</td>
              <td className="px-4 py-3 text-muted">{q.notes ?? '—'}</td>
              {canWrite && (
                <td className="px-4 py-3 text-right">
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => awardVendorRfq(rfqId, q.id))}
                    className="text-xs font-medium text-brand hover:underline disabled:opacity-50"
                  >
                    Award
                  </button>
                </td>
              )}
            </tr>
          ))}
          {quotes.length === 0 && (
            <tr>
              <td colSpan={canWrite ? 7 : 6} className="px-4 py-8 text-center text-muted">No quotes recorded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
