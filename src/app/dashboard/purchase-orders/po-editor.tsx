'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updatePurchaseOrder } from '@/actions/purchase-orders';

type Line = { id: string; description: string; sku: string; quantity: number; uom: string; unitPrice: number };
type Initial = {
  currency: string; incoterm: string | null; paymentTerms: string | null; deliveryDate: Date | null; notes: string | null;
  lines: { id: string; description: string; sku: string | null; quantity: number; uom: string | null; unitPrice: number }[];
};

let nextId = 0;
const blank = (): Line => ({ id: `new-${++nextId}`, description: '', sku: '', quantity: 1, uom: '', unitPrice: 0 });

/** Edits a DRAFT purchase order: commercial terms and lines. Issued POs are locked server-side too. */
export function PoEditor({ poId, initial }: { poId: string; initial: Initial }) {
  const router = useRouter();
  const [currency, setCurrency] = useState(initial.currency);
  const [incoterm, setIncoterm] = useState(initial.incoterm ?? '');
  const [paymentTerms, setPaymentTerms] = useState(initial.paymentTerms ?? '');
  const [deliveryDate, setDeliveryDate] = useState(initial.deliveryDate ? new Date(initial.deliveryDate).toISOString().slice(0, 10) : '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [lines, setLines] = useState<Line[]>(initial.lines.map((l) => ({ ...l, sku: l.sku ?? '', uom: l.uom ?? '' })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const patch = (id: string, p: Partial<Line>) => { setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...p } : l))); setSaved(false); };

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updatePurchaseOrder(poId, { currency, incoterm: incoterm || null, paymentTerms: paymentTerms || null, deliveryDate: deliveryDate || null, notes: notes || null, lines: lines.map((l) => ({ description: l.description, sku: l.sku || null, quantity: l.quantity, uom: l.uom || null, unitPrice: l.unitPrice })) });
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save');
      }
    });
  }

  const f = 'w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink';
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4 print:hidden">
      <h2 className="text-sm font-semibold text-ink">Edit draft</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-muted">Currency<input aria-label="Currency" maxLength={3} value={currency} onChange={(e) => { setCurrency(e.target.value.toUpperCase()); setSaved(false); }} className={f} /></label>
        <label className="text-xs text-muted">Incoterm<input aria-label="Incoterm" value={incoterm} onChange={(e) => { setIncoterm(e.target.value.toUpperCase()); setSaved(false); }} className={f} /></label>
        <label className="text-xs text-muted">Payment terms<input aria-label="Payment terms" value={paymentTerms} onChange={(e) => { setPaymentTerms(e.target.value); setSaved(false); }} placeholder="e.g. 30% advance, balance on delivery" className={f} /></label>
        <label className="text-xs text-muted">Delivery by<input aria-label="Delivery date" type="date" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value); setSaved(false); }} className={f} /></label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Description</th><th className="pb-1 pr-2">SKU</th><th className="pb-1 pr-2">Qty</th><th className="pb-1 pr-2">Unit</th><th className="pb-1 pr-2">Unit price</th><th className="pb-1 text-right">Total</th><th /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2"><input aria-label="Description" value={l.description} onChange={(e) => patch(l.id, { description: e.target.value })} className={f} /></td>
                <td className="py-1 pr-2 w-24"><input aria-label="SKU" value={l.sku} onChange={(e) => patch(l.id, { sku: e.target.value })} className={f} /></td>
                <td className="py-1 pr-2 w-24"><input aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => patch(l.id, { quantity: Number(e.target.value) })} className={f} /></td>
                <td className="py-1 pr-2 w-20"><input aria-label="Unit" value={l.uom} onChange={(e) => patch(l.id, { uom: e.target.value })} className={f} /></td>
                <td className="py-1 pr-2 w-28"><input aria-label="Unit price" type="number" min={0} step="any" value={l.unitPrice} onChange={(e) => patch(l.id, { unitPrice: Number(e.target.value) })} className={f} /></td>
                <td className="py-1 text-right tabular-nums">{(l.quantity * l.unitPrice).toFixed(2)}</td>
                <td className="py-1 pl-2">{lines.length > 1 && <button aria-label="Remove line" onClick={() => { setLines((p) => p.filter((x) => x.id !== l.id)); setSaved(false); }} className="text-xs text-muted hover:text-ink">✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5} className="pt-2 text-right text-xs text-muted">Total</td><td className="pt-2 text-right font-semibold tabular-nums">{currency} {total.toFixed(2)}</td><td /></tr></tfoot>
        </table>
      </div>
      <label className="block text-xs text-muted">Notes to vendor<textarea aria-label="Notes" rows={2} value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} className={f} /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => { setLines((p) => [...p, blank()]); setSaved(false); }} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink">Add line</button>
        <button disabled={pending} onClick={save} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save draft'}</button>
      </div>
    </section>
  );
}
