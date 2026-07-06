'use client';

import { useState, useTransition } from 'react';
import { createVendorRate, deleteVendorRate, setPreferredVendorRate } from '@/actions/vendor-rates';
import type { VendorRate, VendorRateTier, VendorRateMethod } from '@prisma/client';

type Rate = VendorRate & { tiers: VendorRateTier[] };

const METHODS: VendorRateMethod[] = ['per_piece', 'per_kg', 'per_metre'];

/** Per-piece cost preview as the user types a per-kg/per-metre rate — mirrors anabyn's live cost preview. */
function previewPieceCost(method: VendorRateMethod, baseRate: number, normalizedPieceCost?: number) {
  if (method === 'per_piece') return baseRate;
  return normalizedPieceCost ?? baseRate;
}

export function VendorRatesPanel({ vendorId, rates }: { vendorId: string; rates: Rate[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<VendorRateMethod>('per_piece');
  const [baseRate, setBaseRate] = useState('');
  const [normalizedPieceCost, setNormalizedPieceCost] = useState('');

  const submit = (formData: FormData) => {
    setError(null);
    const sku = String(formData.get('sku') ?? '').trim();
    const rate = parseFloat(String(formData.get('baseRate') ?? ''));
    if (!sku || Number.isNaN(rate)) return;
    startTransition(async () => {
      try {
        await createVendorRate({
          vendorId,
          sku,
          description: String(formData.get('description') ?? '') || undefined,
          method,
          baseRate: rate,
          normalizedPieceCost: normalizedPieceCost ? parseFloat(normalizedPieceCost) : undefined,
          moqPieces: formData.get('moqPieces') ? Number(formData.get('moqPieces')) : undefined,
          leadTimeDays: formData.get('leadTimeDays') ? Number(formData.get('leadTimeDays')) : undefined,
        });
        setBaseRate('');
        setNormalizedPieceCost('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add rate');
      }
    });
  };

  const preview = baseRate ? previewPieceCost(method, parseFloat(baseRate), normalizedPieceCost ? parseFloat(normalizedPieceCost) : undefined) : null;

  return (
    <div className="space-y-4">
      <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-3">
        <input name="sku" required placeholder="SKU / description" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
        <select
          name="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as VendorRateMethod)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{m.replace('_', ' ')}</option>
          ))}
        </select>
        <input
          name="baseRate"
          required
          type="number"
          step="0.01"
          placeholder="Rate"
          value={baseRate}
          onChange={(e) => setBaseRate(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        />
        {method !== 'per_piece' && (
          <input
            name="normalizedPieceCost"
            type="number"
            step="0.01"
            placeholder="Per-piece cost"
            value={normalizedPieceCost}
            onChange={(e) => setNormalizedPieceCost(e.target.value)}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        )}
        <input name="moqPieces" type="number" placeholder="MOQ (pieces)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
        <input name="leadTimeDays" type="number" placeholder="Lead time (days)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
        {preview != null && (
          <p className="self-center text-sm text-muted sm:col-span-3">Per-piece cost preview: {preview.toFixed(2)}</p>
        )}
        <div className="flex items-center gap-3 sm:col-span-3">
          <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {pending ? 'Saving…' : 'Add rate'}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Rate</th>
              <th className="px-4 py-3">MOQ</th>
              <th className="px-4 py-3">Lead time</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-ink">
                  {r.sku} {r.isPreferred && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">preferred</span>}
                </td>
                <td className="px-4 py-3 text-muted">{r.method.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-muted">{r.baseRate}{r.normalizedPieceCost != null ? ` (${r.normalizedPieceCost.toFixed(2)}/pc)` : ''}</td>
                <td className="px-4 py-3 text-muted">{r.moqPieces ?? '—'}</td>
                <td className="px-4 py-3 text-muted">{r.leadTimeDays != null ? `${r.leadTimeDays}d` : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    disabled={pending || r.isPreferred}
                    onClick={() => startTransition(() => setPreferredVendorRate(r.id))}
                    className="mr-3 text-xs text-brand hover:underline disabled:opacity-40"
                  >
                    Prefer
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => startTransition(() => deleteVendorRate(r.id))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">No rates yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
