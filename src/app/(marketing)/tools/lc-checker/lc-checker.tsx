'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { checkLcTerms, type LcCheckerResult } from './actions';

const SEVERITY_STYLE: Record<'low' | 'medium' | 'high', string> = {
  high: 'bg-danger/10 text-danger',
  medium: 'bg-warning/10 text-warning',
  low: 'bg-brand/10 text-ink-soft',
};

export function LcChecker() {
  const [lcText, setLcText] = useState('');
  const [orderBrief, setOrderBrief] = useState('');
  const [res, setRes] = useState<LcCheckerResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">LC text or key clauses</label>
      <textarea
        value={lcText}
        onChange={(e) => setLcText(e.target.value)}
        rows={8}
        maxLength={12_000}
        placeholder="Paste the letter of credit — beneficiary, description of goods, latest shipment & expiry dates, documents required, partial-shipment/transhipment clauses…"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <label className="mt-4 mb-1 block text-sm font-medium text-ink">Your order, briefly (optional)</label>
      <input
        value={orderBrief}
        onChange={(e) => setOrderBrief(e.target.value)}
        maxLength={1000}
        placeholder="e.g. 5000 pcs cotton bath towels, FOB Nhava Sheva, ship by 30 Nov, USD 16,000"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
      />

      <button
        disabled={pending || lcText.trim().length < 40}
        onClick={() => start(async () => setRes(await checkLcTerms(lcText, orderBrief)))}
        className="mt-4 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Reviewing LC…' : 'Check for discrepancies'}
      </button>

      {res && !res.ok && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{res.error}</p>}

      {res?.ok && (
        <div className="mt-6 rounded-2xl border border-line bg-white p-6">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${res.result.workable ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
              {res.result.workable ? 'Broadly workable' : 'Needs amendments'}
            </span>
          </div>
          <p className="mt-3 text-sm text-ink-soft">{res.result.summary}</p>

          {res.result.issues.length > 0 && (
            <ul className="mt-5 space-y-3">
              {res.result.issues.map((issue, i) => (
                <li key={i} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{issue.clause}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[issue.severity]}`}>{issue.severity}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{issue.issue}</p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 text-xs text-muted">
            Decision support only — not legal advice or a substitute for your bank or CHA. Always confirm discrepancies with your negotiating bank before shipment.
          </p>
          <div className="mt-4 rounded-lg bg-brand/5 p-3 text-sm text-ink-soft">
            Want this checked automatically against every order, with export docs generated to match?{' '}
            <Link href="/signup" className="font-medium text-brand hover:underline">Create a free workspace →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
