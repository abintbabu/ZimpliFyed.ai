'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { findHsCode, type HsFinderResult } from './actions';

export function HsFinder() {
  const [description, setDescription] = useState('');
  const [res, setRes] = useState<HsFinderResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        maxLength={300}
        placeholder="e.g. 100% cotton terry bath towel, 500 GSM, 70x140 cm"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <button
        disabled={pending || description.trim().length < 3}
        onClick={() => start(async () => setRes(await findHsCode(description)))}
        className="mt-3 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Classifying…' : 'Find HS code'}
      </button>

      {res && !res.ok && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{res.error}</p>}

      {res?.ok && (
        <div className="mt-6 rounded-2xl border border-line bg-white p-6">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-wide text-muted">Estimated ITC-HS code</p>
            <p className="text-2xl font-semibold text-ink">{res.result.hsCode}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Est. duty rate" value={res.result.dutyRatePct != null ? `${res.result.dutyRatePct}%` : '—'} />
            <Stat label="Est. RoDTEP rate" value={res.result.rodtepRatePct != null ? `${res.result.rodtepRatePct}%` : '—'} />
          </div>
          <p className="mt-4 text-sm text-ink-soft">{res.result.rationale}</p>
          <div className="mt-5 rounded-lg bg-brand/5 p-3 text-sm text-ink-soft">
            Want this saved, plus landed-cost and export docs?{' '}
            <Link href="/signup" className="font-medium text-brand hover:underline">Create a free workspace →</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}
