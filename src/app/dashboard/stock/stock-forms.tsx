'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStockItem, recordStockMovement } from '@/actions/stock';
import type { MovementKind } from '@/lib/stock';

export function NewStockItemForm() {
  const router = useRouter();
  const [v, setV] = useState({ sku: '', name: '', location: '', uom: '', reorder: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const f = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input aria-label="SKU" placeholder="SKU" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} className={`${f} w-32`} />
        <input aria-label="Name" placeholder="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={`${f} w-52`} />
        <input aria-label="Location" placeholder="Location (MAIN)" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} className={`${f} w-36`} />
        <input aria-label="Unit" placeholder="Unit (pcs)" value={v.uom} onChange={(e) => setV({ ...v, uom: e.target.value })} className={`${f} w-24`} />
        <input aria-label="Reorder level" type="number" min={0} step="any" placeholder="Reorder at" value={v.reorder} onChange={(e) => setV({ ...v, reorder: e.target.value })} className={`${f} w-28`} />
        <button disabled={pending || !v.sku.trim() || !v.name.trim()} onClick={() => { setError(null); startTransition(async () => { try { await createStockItem({ sku: v.sku, name: v.name, location: v.location, uom: v.uom, reorderLevel: v.reorder === '' ? null : Number(v.reorder) }); setV({ sku: '', name: '', location: '', uom: '', reorder: '' }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not add'); } }); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Add item</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function MovementForm({ itemId, canWrite }: { itemId: string; canWrite: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<MovementKind>('receipt');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!canWrite) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select aria-label="Movement type" value={kind} onChange={(e) => setKind(e.target.value as MovementKind)} className="rounded border border-line px-1.5 py-1 text-xs"><option value="receipt">In</option><option value="issue">Out</option><option value="adjustment">Adjust ±</option></select>
      <input aria-label="Quantity" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20 rounded border border-line px-1.5 py-1 text-xs" />
      <input aria-label="Reason" placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-28 rounded border border-line px-1.5 py-1 text-xs" />
      <button disabled={pending || !qty} onClick={() => { setError(null); startTransition(async () => { try { await recordStockMovement(itemId, { kind, quantity: Number(qty), reason }); setQty(''); setReason(''); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } }); }} className="rounded bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Save</button>
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
