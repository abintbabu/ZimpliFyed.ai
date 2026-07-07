'use client';

import { useState, useTransition } from 'react';
import { recordVendorRfqQuote } from '@/actions/vendor-rfqs';

export function RecordQuoteForm({ rfqId, vendors }: { rfqId: string; vendors: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const vendorId = String(formData.get('vendorId') ?? '');
    const rate = Number(formData.get('rate') ?? '');
    if (!vendorId || !rate) {
      setError('Vendor and rate are required');
      return;
    }

    startTransition(async () => {
      try {
        const moqRaw = String(formData.get('moqPieces') ?? '');
        const leadTimeRaw = String(formData.get('leadTimeDays') ?? '');
        await recordVendorRfqQuote({
          rfqId,
          vendorId,
          rate,
          moqPieces: moqRaw ? Number(moqRaw) : undefined,
          leadTimeDays: leadTimeRaw ? Number(leadTimeRaw) : undefined,
          notes: String(formData.get('notes') ?? ''),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to record quote');
      }
    });
  };

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <p className="text-sm font-semibold text-muted uppercase tracking-wide sm:col-span-2">Record a vendor&apos;s quote</p>
      <select name="vendorId" required className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <option value="">Select vendor…</option>
        {vendors.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      <input name="rate" type="number" step="0.01" required placeholder="Quoted rate" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="moqPieces" type="number" placeholder="MOQ (pieces)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="leadTimeDays" type="number" placeholder="Lead time (days)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <textarea name="notes" placeholder="Notes" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" rows={2} />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Record quote'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
