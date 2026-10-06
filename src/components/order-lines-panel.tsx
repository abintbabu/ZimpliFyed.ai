'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveOrderLines } from '@/actions/orders';

type Line = { id: string; description: string; hsCode: string; quantity: number; uom: string; unitPrice: number };
type Initial = { id: string; description: string; hsCode: string | null; quantity: number; uom: string | null; unitPrice: number }[];

let nextId = 0;
const blank = (): Line => ({ id: `new-${++nextId}`, description: '', hsCode: '', quantity: 1, uom: 'pcs', unitPrice: 0 });
const toLines = (initial: Initial): Line[] =>
  initial.length ? initial.map((l) => ({ id: l.id, description: l.description, hsCode: l.hsCode ?? '', quantity: l.quantity, uom: l.uom ?? '', unitPrice: l.unitPrice })) : [blank()];

export function OrderLinesPanel({ orderId, currency, canWrite, initial }: { orderId: string; currency: string; canWrite: boolean; initial: Initial }) {
  const router = useRouter();
  const [editing, setEditing] = useState(initial.length === 0 && canWrite);
  const [lines, setLines] = useState<Line[]>(toLines(initial));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const patch = (id: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...p } : l)));

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveOrderLines(orderId, {
          currency,
          lines: lines.map((l) => ({ description: l.description, hsCode: l.hsCode || null, quantity: l.quantity, uom: l.uom || null, unitPrice: l.unitPrice })),
        });
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save lines');
      }
    });
  }

  const input = 'w-full rounded-md border border-line px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent';

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Line items</h2>
        {canWrite && !editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1 text-xs text-ink">Edit</button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr><th className="pb-1 pr-2">Description</th><th className="pb-1 pr-2">HS code</th><th className="pb-1 pr-2">Qty</th><th className="pb-1 pr-2">Unit</th><th className="pb-1 pr-2">Price ({currency})</th><th className="pb-1 text-right">Total</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2"><input aria-label="Description" className={input} disabled={!editing} value={l.description} onChange={(e) => patch(l.id, { description: e.target.value })} /></td>
                <td className="py-1 pr-2"><input aria-label="HS code" className={input} disabled={!editing} value={l.hsCode} onChange={(e) => patch(l.id, { hsCode: e.target.value })} /></td>
                <td className="py-1 pr-2 w-24"><input aria-label="Quantity" type="number" min={0} className={input} disabled={!editing} value={l.quantity} onChange={(e) => patch(l.id, { quantity: Number(e.target.value) })} /></td>
                <td className="py-1 pr-2 w-20"><input aria-label="Unit" className={input} disabled={!editing} value={l.uom} onChange={(e) => patch(l.id, { uom: e.target.value })} /></td>
                <td className="py-1 pr-2 w-28"><input aria-label="Unit price" type="number" min={0} step="0.01" className={input} disabled={!editing} value={l.unitPrice} onChange={(e) => patch(l.id, { unitPrice: Number(e.target.value) })} /></td>
                <td className="py-1 text-right tabular-nums">{(l.quantity * l.unitPrice).toFixed(2)}</td>
                <td className="py-1 pl-2">{editing && lines.length > 1 && <button aria-label="Remove line" onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))} className="text-xs text-muted hover:text-ink">✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5} className="pt-2 text-right text-xs text-muted">Order total</td><td className="pt-2 text-right font-semibold tabular-nums">{currency} {total.toFixed(2)}</td><td /></tr></tfoot>
        </table>
      </div>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {editing && (
        <div className="flex gap-2">
          <button onClick={() => setLines((p) => [...p, blank()])} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink">Add line</button>
          <button disabled={pending} onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save lines'}</button>
          {initial.length > 0 && <button disabled={pending} onClick={() => { setLines(toLines(initial)); setEditing(false); setError(null); }} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink">Cancel</button>}
        </div>
      )}
    </section>
  );
}
