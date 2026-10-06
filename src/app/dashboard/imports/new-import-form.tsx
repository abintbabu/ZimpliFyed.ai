'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createImportEntry } from '@/actions/imports';

export function NewImportForm({ vendors }: { vendors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState({ currency: 'USD', rate: '', vendorId: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const f = 'rounded-lg border border-line px-3 py-2 text-sm text-ink';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">Invoice currency<input aria-label="Currency" maxLength={3} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} className={`${f} mt-1 block w-24`} /></label>
        <label className="text-xs text-muted">Customs rate (₹ per unit)<input aria-label="Customs exchange rate" type="number" min={0} step="any" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} className={`${f} mt-1 block w-40`} /></label>
        <label className="text-xs text-muted">Supplier (optional)<select aria-label="Supplier" value={v.vendorId} onChange={(e) => setV({ ...v, vendorId: e.target.value })} className={`${f} mt-1 block w-52`}><option value="">—</option>{vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <button disabled={pending || !v.rate} onClick={() => { setError(null); startTransition(async () => { try { const e = await createImportEntry({ currency: v.currency, exchangeRate: Number(v.rate), vendorId: v.vendorId || undefined }); router.push(`/dashboard/imports/${e.id}`); } catch (err) { setError(err instanceof Error ? err.message : 'Could not create'); } }); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">New import entry</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
