'use client';

import { useState, useTransition } from 'react';
import { recordVendorRfqQuote } from '@/actions/vendor-rfqs';
import { INCOTERMS, isIncoterm, type Incoterm } from '@/lib/landed-cost';

export function RecordQuoteForm({ rfqId, vendors }: { rfqId: string; vendors: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const vendorId = String(formData.get('vendorId') ?? '');
    const rate = Number(formData.get('rate') ?? '');
    const incotermRaw = String(formData.get('incoterm') ?? '');
    if (!vendorId || !rate) {
      setError('Vendor and rate are required');
      return;
    }
    const incoterm: Incoterm = isIncoterm(incotermRaw) ? incotermRaw : 'EXW';
    const num = (name: string) => {
      const raw = String(formData.get(name) ?? '');
      return raw ? Number(raw) : undefined;
    };

    startTransition(async () => {
      try {
        await recordVendorRfqQuote({
          rfqId,
          vendorId,
          rate,
          incoterm,
          moqPieces: num('moqPieces'),
          leadTimeDays: num('leadTimeDays'),
          notes: String(formData.get('notes') ?? ''),
          inlandFreightPerUnit: num('inlandFreightPerUnit'),
          freightPerUnit: num('freightPerUnit'),
          insurancePerUnit: num('insurancePerUnit'),
          dutiesPerUnit: num('dutiesPerUnit'),
          otherCostsPerUnit: num('otherCostsPerUnit'),
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
      <select name="incoterm" defaultValue="EXW" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" title="Incoterm the vendor's rate covers">
        {INCOTERMS.map((term) => (
          <option key={term} value={term}>{term} — rate covers up to {term}</option>
        ))}
      </select>
      <input name="moqPieces" type="number" placeholder="MOQ (pieces)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="leadTimeDays" type="number" placeholder="Lead time (days)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <p className="text-xs text-muted sm:col-span-2">
        Landed-cost add-ons (per unit) — your costs beyond the vendor&apos;s rate. Stages already covered by the vendor&apos;s Incoterm are ignored.
      </p>
      <input name="inlandFreightPerUnit" type="number" step="0.01" min="0" placeholder="Inland freight / unit" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="freightPerUnit" type="number" step="0.01" min="0" placeholder="Ocean/air freight / unit" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="insurancePerUnit" type="number" step="0.01" min="0" placeholder="Insurance / unit" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="dutiesPerUnit" type="number" step="0.01" min="0" placeholder="Duties / unit" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
      <input name="otherCostsPerUnit" type="number" step="0.01" min="0" placeholder="Other costs / unit" className="rounded-lg border border-line px-3 py-2 text-sm text-ink" />
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
