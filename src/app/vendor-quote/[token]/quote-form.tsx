'use client';

import { useState, useTransition } from 'react';
import { submitVendorPortalQuote } from '@/actions/vendor-portal';

const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'];

export function VendorQuoteForm({ token, existing }: { token: string; existing: { rate: number; moqPieces: number | null; leadTimeDays: number | null; incoterm: string; notes: string | null } | null }) {
  const [v, setV] = useState({ rate: existing?.rate?.toString() ?? '', moq: existing?.moqPieces?.toString() ?? '', lead: existing?.leadTimeDays?.toString() ?? '', incoterm: existing?.incoterm ?? 'EXW', notes: existing?.notes ?? '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const f = 'mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink';
  return (
    <form onSubmit={(e) => { e.preventDefault(); setMsg(null); startTransition(async () => { try { await submitVendorPortalQuote(token, { rate: Number(v.rate), moqPieces: v.moq ? Number(v.moq) : null, leadTimeDays: v.lead ? Number(v.lead) : null, incoterm: v.incoterm, notes: v.notes }); setMsg({ ok: true, text: 'Thank you — your quote has been sent. You can reopen this link to revise it until the request closes.' }); } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not send your quote' }); } }); }} className="space-y-3 rounded-2xl border border-line bg-white p-5">
      <p className="text-sm font-semibold text-ink">{existing ? 'Revise your quote' : 'Your quote'}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-muted">Unit price<input aria-label="Unit price" required type="number" min={0} step="any" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} className={f} /></label>
        <label className="text-xs text-muted">Price basis (Incoterm)<select aria-label="Incoterm" value={v.incoterm} onChange={(e) => setV({ ...v, incoterm: e.target.value })} className={f}>{INCOTERMS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="text-xs text-muted">Minimum order qty<input aria-label="Minimum order quantity" type="number" min={1} step={1} value={v.moq} onChange={(e) => setV({ ...v, moq: e.target.value })} className={f} /></label>
        <label className="text-xs text-muted">Lead time (days)<input aria-label="Lead time" type="number" min={0} max={730} step={1} value={v.lead} onChange={(e) => setV({ ...v, lead: e.target.value })} className={f} /></label>
      </div>
      <label className="block text-xs text-muted">Notes<textarea aria-label="Notes" rows={3} maxLength={1000} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={f} /></label>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      <button disabled={pending || !v.rate} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Sending…' : 'Send quote'}</button>
    </form>
  );
}
