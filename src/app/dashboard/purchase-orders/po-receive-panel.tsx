'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGoodsReceipt } from '@/actions/goods-receipts';

type Line = { id: string; description: string; sku: string | null; ordered: number; received: number; remaining: number; uom: string | null };

export function PoReceivePanel({ poId, lines }: { poId: string; lines: Line[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState(lines.map((l) => ({ id: l.id, received: l.remaining, rejected: 0, reason: '' })));
  const [addToStock, setAddToStock] = useState(true);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const patch = (id: string, p: Partial<(typeof rows)[number]>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const f = 'w-24 rounded-lg border border-line px-2 py-1.5 text-sm text-ink';

  function submit() {
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await createGoodsReceipt(poId, {
          receivedAt: date, notes, addToStock,
          lines: lines.map((l, i) => ({ poLineId: l.id, description: l.description, qtyReceived: rows[i].received, qtyRejected: rows[i].rejected, rejectReason: rows[i].reason || null })),
        });
        setMsg({ ok: true, text: `${res.receipt.receiptNumber} recorded${res.complete ? ' — purchase order fully received' : ' (partial delivery)'}${res.stocked ? `; ${res.stocked} item(s) added to stock` : ''}${res.skippedStock.length ? `; not stocked (no SKU): ${res.skippedStock.join(', ')}` : ''}.` });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not record the receipt' });
      }
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4 print:hidden">
      <h2 className="text-sm font-semibold text-ink">Receive goods</h2>
      <label className="text-xs text-muted">Received on <input aria-label="Received date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="ml-1 rounded-lg border border-line px-2 py-1.5 text-sm text-ink" /></label>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Item</th><th className="pb-1 pr-2 text-right">Ordered</th><th className="pb-1 pr-2 text-right">Already in</th><th className="pb-1 pr-2">Received now</th><th className="pb-1 pr-2">Rejected</th><th className="pb-1">Reject reason</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink">{l.description}{!l.sku && <span className="ml-1 text-xs text-muted">(no SKU)</span>}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{l.ordered} {l.uom ?? ''}</td><td className="py-1.5 pr-2 text-right tabular-nums">{l.received}</td>
                <td className="py-1.5 pr-2"><input aria-label={`Received ${l.description}`} type="number" min={0} step="any" value={rows[i].received} onChange={(e) => patch(l.id, { received: Number(e.target.value) })} className={f} /></td>
                <td className="py-1.5 pr-2"><input aria-label={`Rejected ${l.description}`} type="number" min={0} step="any" value={rows[i].rejected} onChange={(e) => patch(l.id, { rejected: Number(e.target.value) })} className={f} /></td>
                <td className="py-1.5"><input aria-label={`Reject reason ${l.description}`} value={rows[i].reason} disabled={rows[i].rejected <= 0} onChange={(e) => patch(l.id, { reason: e.target.value })} className="w-44 rounded-lg border border-line px-2 py-1.5 text-sm text-ink disabled:opacity-40" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} />Add accepted quantities to stock (lines with a SKU)</label>
      <input aria-label="Notes" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      <button disabled={pending} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Record receipt'}</button>
    </section>
  );
}
