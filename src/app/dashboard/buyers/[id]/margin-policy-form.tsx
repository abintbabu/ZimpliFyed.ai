'use client';

import { useState, useTransition } from 'react';
import { setBuyerMarginPolicy } from '@/actions/buyers';

export function MarginPolicyForm({ buyerId, minMarginPct, targetMarginPct, canWrite }: { buyerId: string; minMarginPct: number | null; targetMarginPct: number | null; canWrite: boolean }) {
  const [min, setMin] = useState(minMarginPct?.toString() ?? '');
  const [target, setTarget] = useState(targetMarginPct?.toString() ?? '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const f = 'mt-1 block w-28 rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-60';
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Margin policy</h2>
      <p className="mb-3 text-xs text-muted">Overrides the company-wide floor for this buyer. Leave blank to use the defaults.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">Minimum %<input aria-label="Minimum margin" type="number" min={0} max={99} step="any" disabled={!canWrite} value={min} onChange={(e) => setMin(e.target.value)} className={f} /></label>
        <label className="text-xs text-muted">Target %<input aria-label="Target margin" type="number" min={0} max={99} step="any" disabled={!canWrite} value={target} onChange={(e) => setTarget(e.target.value)} className={f} /></label>
        {canWrite && (
          <button disabled={pending} onClick={() => { setMsg(null); startTransition(async () => { try { await setBuyerMarginPolicy(buyerId, { minMarginPct: min === '' ? null : Number(min), targetMarginPct: target === '' ? null : Number(target) }); setMsg({ ok: true, text: 'Saved' }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' }); } }); }} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
        )}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
