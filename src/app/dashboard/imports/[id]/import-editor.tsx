'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveImportEntry, setImportEntryStatus } from '@/actions/imports';
import { computeImportLandedCost, type ImportLine } from '@/lib/import-landed-cost';

type Line = { id: string; description: string; hsCode: string; quantity: number; unitPrice: number; bcdPct: number; swsPct: number; igstPct: number; otherDutyPct: number };
type Entry = { id: string; currency: string; exchangeRate: number; status: string; boeNumber: string | null; boeDate: Date | null; freightInr: number; insuranceInr: number; portInr: number; chaInr: number; transportInr: number; warehousingInr: number; otherInr: number; lines: { id: string; description: string; hsCode: string | null; quantity: number; unitPrice: number; bcdPct: number; swsPct: number; igstPct: number; otherDutyPct: number }[] };

let n = 0;
const blank = (): Line => ({ id: `new-${++n}`, description: '', hsCode: '', quantity: 1, unitPrice: 0, bcdPct: 0, swsPct: 10, igstPct: 18, otherDutyPct: 0 });
const inr = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ImportEditor({ entry, canWrite }: { entry: Entry; canWrite: boolean }) {
  const router = useRouter();
  const locked = entry.status === 'cleared' || !canWrite;
  const [rate, setRate] = useState(entry.exchangeRate);
  const [boe, setBoe] = useState(entry.boeNumber ?? '');
  const [boeDate, setBoeDate] = useState(entry.boeDate ? new Date(entry.boeDate).toISOString().slice(0, 10) : '');
  const [c, setC] = useState({ freightInr: entry.freightInr, insuranceInr: entry.insuranceInr, portInr: entry.portInr, chaInr: entry.chaInr, transportInr: entry.transportInr, warehousingInr: entry.warehousingInr, otherInr: entry.otherInr });
  const [lines, setLines] = useState<Line[]>(entry.lines.length ? entry.lines.map((l) => ({ ...l, hsCode: l.hsCode ?? '' })) : [blank()]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const calc = useMemo(() => {
    const live = lines.filter((l) => l.description.trim());
    if (live.length === 0) return { error: 'Add a line to see the landed cost.' as string };
    try { return { result: computeImportLandedCost({ currency: entry.currency, exchangeRate: rate, ...c, lines: live as ImportLine[] }) }; }
    catch (e) { return { error: e instanceof Error ? e.message : 'Check the figures' }; }
  }, [lines, rate, c, entry.currency]);

  const patch = (id: string, p: Partial<Line>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const f = 'w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink disabled:bg-transparent disabled:border-transparent';
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const run = (fn: () => Promise<unknown>, ok: string) => { setMsg(null); startTransition(async () => { try { await fn(); setMsg({ ok: true, text: ok }); router.refresh(); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed' }); } }); };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">Bill of entry</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-muted">BOE number<input aria-label="BOE number" disabled={locked} value={boe} onChange={(e) => setBoe(e.target.value)} className={f} /></label>
          <label className="text-xs text-muted">BOE date<input aria-label="BOE date" type="date" disabled={locked} value={boeDate} onChange={(e) => setBoeDate(e.target.value)} className={f} /></label>
          <label className="text-xs text-muted">Customs rate (₹ per {entry.currency})<input aria-label="Exchange rate" type="number" min={0} step="any" disabled={locked} value={rate} onChange={(e) => setRate(Number(e.target.value))} className={f} /></label>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([['freightInr', 'Freight ₹'], ['insuranceInr', 'Insurance ₹'], ['portInr', 'Port / THC ₹'], ['chaInr', 'CHA ₹'], ['transportInr', 'Transport ₹'], ['warehousingInr', 'Warehousing ₹'], ['otherInr', 'Other ₹']] as const).map(([k, label]) => (
            <label key={k} className="text-xs text-muted">{label}<input aria-label={label} type="number" min={0} step="any" disabled={locked} value={c[k]} onChange={(e) => setC((p) => ({ ...p, [k]: num(e.target.value) }))} className={f} /></label>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">Lines <span className="text-xs font-normal text-muted">— duty rates come from the tariff / your bill of entry</span></h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Description</th><th className="pb-1 pr-2">HS</th><th className="pb-1 pr-2">Qty</th><th className="pb-1 pr-2">Unit price ({entry.currency})</th><th className="pb-1 pr-2">BCD %</th><th className="pb-1 pr-2">SWS % of BCD</th><th className="pb-1 pr-2">IGST %</th><th className="pb-1 pr-2">Other duty %</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-1 pr-2"><input aria-label="Description" disabled={locked} value={l.description} onChange={(e) => patch(l.id, { description: e.target.value })} className={f} /></td>
                  <td className="py-1 pr-2 w-28"><input aria-label="HS code" disabled={locked} value={l.hsCode} onChange={(e) => patch(l.id, { hsCode: e.target.value })} className={f} /></td>
                  {(['quantity', 'unitPrice', 'bcdPct', 'swsPct', 'igstPct', 'otherDutyPct'] as const).map((k) => (
                    <td key={k} className="py-1 pr-2 w-24"><input aria-label={k} type="number" min={0} step="any" disabled={locked} value={l[k]} onChange={(e) => patch(l.id, { [k]: num(e.target.value) })} className={f} /></td>
                  ))}
                  <td>{!locked && lines.length > 1 && <button aria-label="Remove line" onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))} className="text-xs text-muted hover:text-ink">✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!locked && <button onClick={() => setLines((p) => [...p, blank()])} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink">Add line</button>}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold text-ink">True landed cost</h2>
        {'error' in calc ? <p className="text-sm text-muted">{calc.error}</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="pb-1 pr-2">Line</th><th className="pb-1 pr-2 text-right">Goods ₹</th><th className="pb-1 pr-2 text-right">Assessable ₹</th><th className="pb-1 pr-2 text-right">Duties ₹</th><th className="pb-1 pr-2 text-right">IGST ₹ (creditable)</th><th className="pb-1 pr-2 text-right">Landed ₹</th><th className="pb-1 text-right">Per unit ₹</th></tr></thead>
                <tbody>
                  {calc.result.lines.map((l, i) => (
                    <tr key={i} className="border-t border-line"><td className="py-1.5 pr-2 text-ink">{l.description}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(l.fobInr)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(l.assessableValue)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(l.bcd + l.sws + l.otherDuty)}</td><td className="py-1.5 pr-2 text-right tabular-nums text-muted">{inr(l.igst)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(l.landedCost)}</td><td className="py-1.5 text-right font-semibold tabular-nums">{inr(l.landedCostPerUnit)}</td></tr>
                  ))}
                  <tr className="border-t-2 border-ink font-semibold"><td className="py-1.5 pr-2">Total</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(calc.result.totals.fobInr)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(calc.result.totals.assessableValue)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(calc.result.totals.duties)}</td><td className="py-1.5 pr-2 text-right tabular-nums text-muted">{inr(calc.result.totals.igst)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{inr(calc.result.totals.landedCost)}</td><td className="py-1.5 text-right text-xs font-normal text-muted">{calc.result.totals.uplift}× goods value</td></tr>
                </tbody>
              </table>
            </div>
            <ul className="space-y-0.5 text-xs text-muted">{calc.result.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>
          </>
        )}
      </section>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</p>}
      {!locked && (
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} onClick={() => run(() => saveImportEntry(entry.id, { boeNumber: boe, boeDate: boeDate || null, exchangeRate: rate, ...c, lines: lines.map((l) => ({ ...l, hsCode: l.hsCode || null })) }), 'Saved')} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
          {entry.status === 'draft' && <button disabled={pending} onClick={() => run(() => setImportEntryStatus(entry.id, 'assessed'), 'Marked assessed')} className="rounded-lg border border-line px-4 py-2 text-sm text-ink disabled:opacity-50">Mark assessed</button>}
          {entry.status === 'assessed' && <button disabled={pending} onClick={() => { if (window.confirm('Mark cleared? A cleared entry is locked.')) run(() => setImportEntryStatus(entry.id, 'cleared'), 'Marked cleared'); }} className="rounded-lg border border-line px-4 py-2 text-sm text-ink disabled:opacity-50">Mark cleared</button>}
        </div>
      )}
    </div>
  );
}
