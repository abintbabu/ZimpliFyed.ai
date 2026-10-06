'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProductionRun, setStageDone, setProducedQty, setRunStatus, createQcInspection } from '@/actions/production';

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => { setError(null); startTransition(async () => { try { await fn(); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); } }); };
  return { error, pending, run };
}

const f = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';

export function NewRunForm({ orders }: { orders: { id: string; orderNumber: string }[] }) {
  const [v, setV] = useState({ desc: '', qty: '', orderId: '', due: '' });
  const { error, pending, run } = useRun();
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">Plan a production run</p>
      <div className="flex flex-wrap gap-2">
        <input aria-label="What is being produced" placeholder="What is being produced" value={v.desc} onChange={(e) => setV({ ...v, desc: e.target.value })} className={`${f} w-64`} />
        <input aria-label="Planned quantity" type="number" min={0} step="any" placeholder="Quantity" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} className={`${f} w-28`} />
        <select aria-label="Order" value={v.orderId} onChange={(e) => setV({ ...v, orderId: e.target.value })} className={`${f} w-44`}><option value="">No order</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select>
        <input aria-label="Due date" type="date" value={v.due} onChange={(e) => setV({ ...v, due: e.target.value })} className={f} />
        <button disabled={pending || !v.desc.trim() || !v.qty} onClick={() => run(async () => { await createProductionRun({ productDescription: v.desc, plannedQty: Number(v.qty), orderId: v.orderId || undefined, dueDate: v.due || undefined }); setV({ desc: '', qty: '', orderId: '', due: '' }); })} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Plan run</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

type Stage = { id: string; name: string; completedAt: Date | null; plannedAt: Date | null };

export function RunControls({ runId, producedQty, status, stages, canWrite }: { runId: string; producedQty: number; status: string; stages: Stage[]; canWrite: boolean }) {
  const [qty, setQty] = useState(String(producedQty));
  const { error, pending, run } = useRun();
  const closed = status === 'completed' || status === 'cancelled';
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {stages.map((s) => (
          <li key={s.id}><label className="flex items-center gap-1.5 text-ink"><input type="checkbox" disabled={!canWrite || closed || pending} checked={!!s.completedAt} onChange={(e) => run(() => setStageDone(runId, s.id, e.target.checked))} />{s.name}</label></li>
        ))}
      </ul>
      {canWrite && !closed && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="text-muted">Produced so far <input aria-label="Produced quantity" type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="ml-1 w-24 rounded border border-line px-1.5 py-1 text-xs text-ink" /></label>
          <button disabled={pending} onClick={() => run(() => setProducedQty(runId, Number(qty)))} className="rounded border border-line px-2 py-1 text-ink">Update</button>
          <button disabled={pending} onClick={() => run(() => setRunStatus(runId, 'completed'))} className="rounded bg-brand px-2 py-1 font-medium text-white disabled:opacity-50">Complete run</button>
          <button disabled={pending} onClick={() => { if (window.confirm('Cancel this run?')) run(() => setRunStatus(runId, 'cancelled')); }} className="text-muted underline hover:text-ink">Cancel</button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export function QcForm({ orders, runs }: { orders: { id: string; orderNumber: string }[]; runs: { id: string; runNumber: string }[] }) {
  const [v, setV] = useState({ orderId: '', runId: '', kind: 'final' as 'inline' | 'final', sample: '', aqlMajor: '2.5', aqlMinor: '4', inspector: '', critical: '0', major: '0', minor: '0', note: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { pending, run } = useRun();
  const submit = () => {
    setMsg(null);
    run(async () => {
      try {
        const r = await createQcInspection({ orderId: v.orderId || undefined, runId: v.runId || undefined, kind: v.kind, sampleSize: Number(v.sample), aqlMajor: Number(v.aqlMajor), aqlMinor: Number(v.aqlMinor), inspector: v.inspector, defects: [{ description: 'Critical defects', severity: 'critical', count: Number(v.critical) }, { description: 'Major defects', severity: 'major', count: Number(v.major) }, { description: 'Minor defects', severity: 'minor', count: Number(v.minor) }], notes: v.note });
        setMsg({ ok: r.verdict.result === 'pass', text: `${r.inspection.inspectionNumber}: ${r.verdict.result.toUpperCase()}${r.verdict.reasons.length ? ` — ${r.verdict.reasons.join(' ')}` : ''}` });
      } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' }); }
    });
  };
  const n = 'w-20 rounded-lg border border-line px-2 py-2 text-sm text-ink';
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-white p-4">
      <p className="text-sm font-semibold text-ink">Record a quality inspection</p>
      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="Order" value={v.orderId} onChange={(e) => setV({ ...v, orderId: e.target.value })} className={`${f} w-40`}><option value="">Order…</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}</select>
        <select aria-label="Run" value={v.runId} onChange={(e) => setV({ ...v, runId: e.target.value })} className={`${f} w-36`}><option value="">Run…</option>{runs.map((r) => <option key={r.id} value={r.id}>{r.runNumber}</option>)}</select>
        <select aria-label="Kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as 'inline' | 'final' })} className={`${f} w-28`}><option value="final">Final</option><option value="inline">Inline</option></select>
        {([['sample', 'Sample size'], ['aqlMajor', 'Major AQL %'], ['aqlMinor', 'Minor AQL %'], ['critical', 'Critical'], ['major', 'Major'], ['minor', 'Minor']] as const).map(([k, label]) => (
          <label key={k} className="text-xs text-muted">{label}<input aria-label={label} type="number" min={0} step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`${n} mt-1 block`} /></label>
        ))}
        <input aria-label="Inspector" placeholder="Inspector" value={v.inspector} onChange={(e) => setV({ ...v, inspector: e.target.value })} className={`${f} w-36`} />
        <button disabled={pending || !v.sample || (!v.orderId && !v.runId)} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record</button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      <p className="text-xs text-muted">Pass/fail here is a simplified screen — defect percentage against the AQL, any critical defect failing. It is not the ISO 2859-1 sampling plan; if your buyer&apos;s contract names a plan, use that plan&apos;s accept/reject numbers. A failed final inspection blocks marking the order shipped.</p>
    </div>
  );
}
