'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, FileDown } from 'lucide-react';
import { getGstPrepPack } from '@/actions/gst-prep';
import type { GstPrepPack } from '@/lib/gst-prep';
import { AdvisoryDisclaimer } from '@/components/advisory-disclaimer';

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function money(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Copy the pack as a plain-text summary the user can paste into an email to their CA. */
function packAsText(pack: GstPrepPack): string {
  const lines: string[] = [
    `GST filing prep — ${pack.period}`,
    '',
    `Input tax credit (ITC-eligible expenses): ${pack.input.itcEligibleCount} item(s), ${inr(pack.input.itcEligibleTotal)}`,
  ];
  for (const h of pack.input.byHead) lines.push(`  • ${h.gstHead}: ${h.count} × ${inr(h.total)}`);
  lines.push('');
  lines.push('Zero-rated export turnover:');
  for (const c of pack.outward.byCurrency) lines.push(`  • ${c.currency}: ${c.count} invoice(s), ${money(c.total, c.currency)}`);
  if (pack.input.pendingReviewCount > 0) {
    lines.push('', `NOTE: ${pack.input.pendingReviewCount} expense(s) still in the review queue for this period.`);
  }
  return lines.join('\n');
}

export function GstPrepView({ initialPeriod, initialPack }: { initialPeriod: string; initialPack: GstPrepPack }) {
  const [period, setPeriod] = useState(initialPeriod);
  const [pack, setPack] = useState(initialPack);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function changePeriod(next: string) {
    setPeriod(next);
    setError(null);
    startTransition(async () => {
      try {
        setPack(await getGstPrepPack(next));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load that period');
      }
    });
  }

  async function copyForCa() {
    await navigator.clipboard.writeText(packAsText(pack));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted">
          Period{' '}
          <input
            type="month"
            value={period}
            onChange={(e) => changePeriod(e.target.value)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
          />
        </label>
        <button
          onClick={copyForCa}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
        >
          <FileDown className="h-4 w-4" /> {copied ? 'Copied!' : 'Copy summary for CA'}
        </button>
        {pending && <span className="text-xs text-muted">Loading…</span>}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {pack.input.pendingReviewCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {pack.input.pendingReviewCount} expense{pack.input.pendingReviewCount > 1 ? 's are' : ' is'} still in the review queue for this period — clear them for an accurate ITC total.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Input tax credit</h2>
            <span className="text-lg font-semibold text-ink">{inr(pack.input.itcEligibleTotal)}</span>
          </div>
          {pack.input.byHead.length === 0 ? (
            <p className="text-sm text-muted">No ITC-eligible expenses booked in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="pb-2 font-medium">GST head</th><th className="pb-2 text-right font-medium">Items</th><th className="pb-2 text-right font-medium">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pack.input.byHead.map((h) => (
                  <tr key={h.gstHead}>
                    <td className="py-1.5 text-ink">{h.gstHead}</td>
                    <td className="py-1.5 text-right text-muted">{h.count}</td>
                    <td className="py-1.5 text-right text-ink">{inr(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted">
            {pack.input.itcEligibleCount} eligible · {pack.input.excludedCount} excluded (not eligible or unreviewed)
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Zero-rated exports</h2>
            <span className="text-xs text-muted">{pack.outward.invoiceCount} invoice(s)</span>
          </div>
          {pack.outward.byCurrency.length === 0 ? (
            <p className="text-sm text-muted">No export invoices dated in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="pb-2 font-medium">Currency</th><th className="pb-2 text-right font-medium">Invoices</th><th className="pb-2 text-right font-medium">Turnover</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pack.outward.byCurrency.map((c) => (
                  <tr key={c.currency}>
                    <td className="py-1.5 text-ink">{c.currency}</td>
                    <td className="py-1.5 text-right text-muted">{c.count}</td>
                    <td className="py-1.5 text-right text-ink">{money(c.total, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-muted">Exports are zero-rated supplies (with/without LUT) — your CA reconciles against the shipping bills.</p>
        </section>
      </div>

      <AdvisoryDisclaimer kind="gst" />
    </div>
  );
}
