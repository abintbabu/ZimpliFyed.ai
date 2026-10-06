'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePackingEntries } from '@/actions/packing';
import { summarizePacking } from '@/lib/packing';

const rowCbm = (r: { cartonCount: number; lengthCm: number; widthCm: number; heightCm: number }) =>
  (r.cartonCount * r.lengthCm * r.widthCm * r.heightCm) / 1_000_000;

type Row = {
  id: string; orderLineId: string; marks: string;
  cartonCount: number; qtyPerCarton: number; netWeightKg: number; grossWeightKg: number;
  lengthCm: number; widthCm: number; heightCm: number;
};
type Initial = Omit<Row, 'id' | 'orderLineId' | 'marks'> & { id: string; orderLineId: string | null; marks: string | null };

let nextId = 0;
const blank = (orderLineId = ''): Row => ({ id: `new-${++nextId}`, orderLineId, marks: '', cartonCount: 1, qtyPerCarton: 1, netWeightKg: 0, grossWeightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0 });
const toRows = (init: Initial[]): Row[] => init.map((r) => ({ ...r, orderLineId: r.orderLineId ?? '', marks: r.marks ?? '' }));

export function PackingPanel({ orderId, canWrite, lines, initial }: {
  orderId: string; canWrite: boolean;
  lines: { id: string; description: string; quantity: number }[];
  initial: Initial[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(toRows(initial));
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lineDesc = (id: string) => lines.find((l) => l.id === id)?.description ?? null;
  const valid = rows.filter((r) => r.cartonCount > 0 && r.qtyPerCarton > 0);
  const { totals } = summarizePacking(valid.map((r) => ({ ...r, description: lineDesc(r.orderLineId) })));
  const goodsQty = lines.reduce((s, l) => s + l.quantity, 0);
  const patch = (id: string, p: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await savePackingEntries(orderId, rows.map((r) => ({ ...r, orderLineId: r.orderLineId || null, marks: r.marks || null })));
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save packing');
      }
    });
  }

  const num = 'w-20 rounded-md border border-line px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent';
  const mismatch = rows.length > 0 && Math.abs(totals.quantity - goodsQty) > 0.01;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Packing</h2>
        {canWrite && !editing && <button onClick={() => { setEditing(true); if (!rows.length) setRows([blank(lines[0]?.id)]); }} className="rounded-lg border border-line px-3 py-1 text-xs text-ink">{rows.length ? 'Edit' : 'Add packing'}</button>}
      </div>

      {rows.length === 0 && !editing ? (
        <p className="text-sm text-muted">No carton data yet — the packing list will print quantities only. Add cartons, weights and dimensions to produce a customs-ready list.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-muted"><tr>
              <th className="pb-1 pr-2">Goods</th><th className="pb-1 pr-2">Marks</th><th className="pb-1 pr-2">Cartons</th><th className="pb-1 pr-2">Qty/ctn</th>
              <th className="pb-1 pr-2">Net kg/ctn</th><th className="pb-1 pr-2">Gross kg/ctn</th><th className="pb-1 pr-2">L cm</th><th className="pb-1 pr-2">W cm</th><th className="pb-1 pr-2">H cm</th><th className="pb-1 text-right">CBM</th><th />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                return (
                  <tr key={r.id}>
                    <td className="py-1 pr-2">
                      <select aria-label="Goods" disabled={!editing} value={r.orderLineId} onChange={(e) => patch(r.id, { orderLineId: e.target.value })} className="max-w-[180px] rounded-md border border-line px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent">
                        <option value="">—</option>
                        {lines.map((l) => <option key={l.id} value={l.id}>{l.description}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2"><input aria-label="Marks" disabled={!editing} value={r.marks} onChange={(e) => patch(r.id, { marks: e.target.value })} className="w-28 rounded-md border border-line px-2 py-1 text-sm disabled:bg-transparent disabled:border-transparent" /></td>
                    {(['cartonCount', 'qtyPerCarton', 'netWeightKg', 'grossWeightKg', 'lengthCm', 'widthCm', 'heightCm'] as const).map((k) => (
                      <td key={k} className="py-1 pr-2"><input aria-label={k} type="number" min={0} step="any" disabled={!editing} value={r[k]} onChange={(e) => patch(r.id, { [k]: Number(e.target.value) })} className={num} /></td>
                    ))}
                    <td className="py-1 text-right tabular-nums">{rowCbm(r).toFixed(3)}</td>
                    <td className="py-1 pl-2">{editing && <button aria-label="Remove row" onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} className="text-xs text-muted hover:text-ink">✕</button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t border-line text-xs">
              <td colSpan={2} className="pt-2 font-medium text-ink">Totals</td>
              <td className="pt-2 tabular-nums">{totals.cartons}</td><td className="pt-2 tabular-nums">{totals.quantity}</td>
              <td className="pt-2 tabular-nums">{totals.netWeightKg.toFixed(2)}</td><td className="pt-2 tabular-nums">{totals.grossWeightKg.toFixed(2)}</td>
              <td colSpan={3} className="pt-2 text-muted">net / gross kg</td><td className="pt-2 text-right font-semibold tabular-nums">{totals.cbm.toFixed(3)}</td><td />
            </tr></tfoot>
          </table>
        </div>
      )}

      {mismatch && <p role="alert" className="text-sm text-amber-800">Cartons hold {totals.quantity} units but the order lines total {goodsQty}. The packing list will be flagged until these match.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {editing && (
        <div className="flex gap-2">
          <button onClick={() => setRows((p) => [...p, blank(lines[0]?.id)])} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink">Add row</button>
          <button disabled={pending} onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save packing'}</button>
          <button disabled={pending} onClick={() => { setRows(toRows(initial)); setEditing(false); setError(null); }} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink">Cancel</button>
        </div>
      )}
    </section>
  );
}
