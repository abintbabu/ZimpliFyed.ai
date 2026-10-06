'use client';

import { useState, useTransition } from 'react';
import { updateProduct } from '@/actions/products';
import { fitCartons, CONTAINER_SPECS, type ContainerTypeId } from '@/lib/loadability';

type P = { lengthCm: number | null; widthCm: number | null; heightCm: number | null; netWeightKg: number | null; grossWeightKg: number | null; piecesPerCarton: number | null; reorderLevel: number | null };

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const show = (n: number | null) => (n == null ? '' : String(n));

/** Carton dimensions, weights and reorder level — the data the container planner and stock alerts read. */
export function ProductLogisticsForm({ productId, product, canWrite }: { productId: string; product: P; canWrite: boolean }) {
  const [f, setF] = useState({ lengthCm: show(product.lengthCm), widthCm: show(product.widthCm), heightCm: show(product.heightCm), netWeightKg: show(product.netWeightKg), grossWeightKg: show(product.grossWeightKg), piecesPerCarton: show(product.piecesPerCarton), reorderLevel: show(product.reorderLevel) });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setMsg(null); };

  const l = num(f.lengthCm), w = num(f.widthCm), h = num(f.heightCm), g = num(f.grossWeightKg);
  const cbm = l && w && h ? (l * w * h) / 1_000_000 : null;
  const canFit = l && w && h && g;

  const field = 'mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-60';
  const inputs: [keyof typeof f, string][] = [['lengthCm', 'Carton L (cm)'], ['widthCm', 'Carton W (cm)'], ['heightCm', 'Carton H (cm)'], ['netWeightKg', 'Net kg / carton'], ['grossWeightKg', 'Gross kg / carton'], ['piecesPerCarton', 'Pieces / carton'], ['reorderLevel', 'Reorder level']];
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Packing &amp; stock</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {inputs.map(([k, label]) => (
          <label key={k} className="text-xs text-muted">{label}<input aria-label={label} type="number" min={0} step="any" disabled={!canWrite} value={f[k]} onChange={(e) => set(k, e.target.value)} className={field} /></label>
        ))}
      </div>
      {cbm != null && <p className="text-xs text-muted">Carton volume {cbm.toFixed(4)} m³{canFit && ` · per container: ${(['20GP', '40GP', '40HC'] as ContainerTypeId[]).map((t) => `${t} ${fitCartons({ lengthCm: l!, widthCm: w!, heightCm: h!, grossWeightKg: g! }, CONTAINER_SPECS[t]).fit}`).join(' · ')}`}</p>}
      {canWrite && (
        <div className="flex items-center gap-3">
          <button disabled={pending} onClick={() => { setMsg(null); startTransition(async () => { try { await updateProduct(productId, { lengthCm: num(f.lengthCm), widthCm: num(f.widthCm), heightCm: num(f.heightCm), netWeightKg: num(f.netWeightKg), grossWeightKg: num(f.grossWeightKg), piecesPerCarton: num(f.piecesPerCarton), reorderLevel: num(f.reorderLevel) }); setMsg({ ok: true, text: 'Saved' }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not save' }); } }); }} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
        </div>
      )}
    </section>
  );
}
