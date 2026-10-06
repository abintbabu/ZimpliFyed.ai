'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveCostSheet, suggestFreightForQuote, suggestCostsForQuote } from '@/actions/cost-sheets';
import { computeLandedCost, priceForTargetMargin, INCOTERMS } from '@/lib/landed-cost';
import type { CostCategory } from '@prisma/client';

const CATEGORY_LABELS: Record<CostCategory, string> = {
  material: 'Material',
  conversion: 'Conversion',
  packing: 'Packing',
  inland_freight: 'Inland freight',
  cha: 'CHA / customs handling',
  port: 'Port charges',
  freight: 'Ocean/air freight',
  insurance: 'Insurance',
  finance_cost: 'Finance cost',
  duties: 'Duties',
  other: 'Other',
  commission: 'Agent commission',
  bank_charges: 'Bank charges',
  documentation: 'Documentation charges',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as CostCategory[];

type Line = { id: string; category: CostCategory; label: string; amountPerUnit: number };

let nextId = 0;
function newLine(category: CostCategory = 'material'): Line {
  nextId += 1;
  return { id: `new-${nextId}`, category, label: '', amountPerUnit: 0 };
}

export function CostSheetPanel({
  quoteId,
  canWrite,
  initial,
}: {
  quoteId: string;
  canWrite: boolean;
  initial: {
    incoterm: string;
    sellPricePerUnit: number;
    rodtepPct: number;
    lines: { category: CostCategory; label: string | null; amountPerUnit: number }[];
  } | null;
}) {
  const [incoterm, setIncoterm] = useState(initial?.incoterm ?? 'FOB');
  const [sellPricePerUnit, setSellPricePerUnit] = useState(initial?.sellPricePerUnit ?? 0);
  const [rodtepPct, setRodtepPct] = useState(initial?.rodtepPct ?? 0);
  const [lines, setLines] = useState<Line[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({ ...newLine(l.category), label: l.label ?? '', amountPerUnit: l.amountPerUnit }))
      : [newLine('material')],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [targetMargin, setTargetMargin] = useState(20);
  const [historyNote, setHistoryNote] = useState<string[] | null>(null);
  const [freightNote, setFreightNote] = useState<{ tone: 'ok' | 'warn'; lines: string[] } | null>(null);

  const result = useMemo(
    () => computeLandedCost({ incoterm, sellPricePerUnit, rodtepPct, lines }),
    [incoterm, sellPricePerUnit, rodtepPct, lines],
  );

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setSaved(false);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setSaved(false);
  }

  /** Merges the accepted-forwarder-quote freight into the freight line (replacing a previous pull). Not saved until the user saves. */
  function pullAcceptedFreight() {
    setFreightNote(null);
    startTransition(async () => {
      const s = await suggestFreightForQuote(quoteId);
      if ('unavailable' in s) { setFreightNote({ tone: 'warn', lines: [s.unavailable] }); return; }
      if (s.perUnit == null) { setFreightNote({ tone: 'warn', lines: s.problems }); return; }
      const label = `Freight — ${s.sources.map((x) => `${x.forwarderName} (${x.shipmentNumber})`).join(', ')}`;
      setLines((prev) => {
        const existing = prev.find((l) => l.category === 'freight' && l.label.startsWith('Freight —'));
        if (existing) return prev.map((l) => (l.id === existing.id ? { ...l, label, amountPerUnit: s.perUnit! } : l));
        return [...prev, { ...newLine('freight'), label, amountPerUnit: s.perUnit! }];
      });
      setSaved(false);
      setFreightNote({
        tone: s.problems.length ? 'warn' : 'ok',
        lines: [
          `Added ${s.targetCurrency} ${s.perUnit.toFixed(2)}/unit (${s.targetCurrency} ${s.totalShare.toFixed(2)} share of ${s.sources.map((x) => x.quoted).join(' + ')}). Review, then save.`,
          ...s.problems,
        ],
      });
    });
  }

  /** Fills EMPTY cost heads from history; never overwrites a figure the user already entered. */
  function suggestFromHistory() {
    setHistoryNote(null);
    startTransition(async () => {
      const r = await suggestCostsForQuote(quoteId, incoterm);
      if ('unavailable' in r) { setHistoryNote([r.unavailable]); return; }
      if (r.suggestions.length === 0) { setHistoryNote(['Not enough history yet — suggestions need at least 2 earlier cost sheets in the same currency.']); return; }
      const notes: string[] = [];
      setLines((prev) => {
        const next = [...prev];
        for (const s of r.suggestions) {
          const existing = next.find((l) => l.category === s.category && l.amountPerUnit > 0);
          if (existing) continue;
          const blank = next.find((l) => l.category === s.category && l.amountPerUnit === 0);
          const label = `Suggested · median of ${s.samples} (${s.min}–${s.max}), ${s.confidence} confidence`;
          if (blank) { blank.amountPerUnit = s.amountPerUnit; blank.label = blank.label || label; }
          else next.push({ ...newLine(s.category), label, amountPerUnit: s.amountPerUnit });
          notes.push(`${CATEGORY_LABELS[s.category]}: ${r.currency} ${s.amountPerUnit.toFixed(2)} from ${s.samples} past sheets`);
        }
        return next;
      });
      setSaved(false);
      setHistoryNote(notes.length ? [...notes, 'Review each figure, then save.'] : ['Every cost head already has a figure — nothing to fill.']);
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await saveCostSheet({
          quoteId,
          incoterm,
          sellPricePerUnit,
          rodtepPct,
          lines: lines.map((l) => ({ category: l.category, label: l.label || undefined, amountPerUnit: l.amountPerUnit })),
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save cost sheet');
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-muted uppercase tracking-wide">Cost sheet — true landed margin</h2>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          Incoterm
          <select
            value={incoterm}
            disabled={!canWrite}
            onChange={(e) => { setIncoterm(e.target.value); setSaved(false); }}
            className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-60"
          >
            {INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Sell price / unit
          <input
            type="number" step="0.01" disabled={!canWrite}
            value={sellPricePerUnit}
            onChange={(e) => { setSellPricePerUnit(Number(e.target.value)); setSaved(false); }}
            className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-60"
          />
        </label>
        <label className="text-xs text-muted">
          RoDTEP credit %
          <input
            type="number" step="0.1" disabled={!canWrite}
            value={rodtepPct}
            onChange={(e) => { setRodtepPct(Number(e.target.value)); setSaved(false); }}
            className="mt-1 block w-full rounded-lg border border-line px-3 py-2 text-sm text-ink disabled:opacity-60"
          />
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((line) => {
          const excluded = result.excludedLines.some((e) => e.category === line.category && e.amountPerUnit === line.amountPerUnit);
          return (
            <div key={line.id} className={`grid grid-cols-12 items-center gap-2 rounded-lg px-2 py-1 ${excluded ? 'opacity-50' : ''}`}>
              <select
                value={line.category} disabled={!canWrite}
                onChange={(e) => updateLine(line.id, { category: e.target.value as CostCategory })}
                className="col-span-4 rounded-lg border border-line px-2 py-1.5 text-sm text-ink disabled:opacity-60"
              >
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <input
                placeholder="Note (optional)" disabled={!canWrite}
                value={line.label}
                onChange={(e) => updateLine(line.id, { label: e.target.value })}
                className="col-span-5 rounded-lg border border-line px-2 py-1.5 text-sm text-ink disabled:opacity-60"
              />
              <input
                type="number" step="0.01" disabled={!canWrite}
                value={line.amountPerUnit}
                onChange={(e) => updateLine(line.id, { amountPerUnit: Number(e.target.value) })}
                className="col-span-2 rounded-lg border border-line px-2 py-1.5 text-sm text-ink disabled:opacity-60"
              />
              {canWrite && (
                <button onClick={() => removeLine(line.id)} className="col-span-1 text-xs text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <button
          onClick={() => setLines((prev) => [...prev, newLine()])}
          className="mt-2 text-xs font-medium text-brand hover:underline"
        >
          + Add cost line
        </button>
      )}

      {canWrite && (
        <div className="mt-1 space-y-1">
          <button onClick={suggestFromHistory} disabled={pending} className="block text-xs font-medium text-brand hover:underline disabled:opacity-50">
            ↳ Suggest empty heads from my past cost sheets
          </button>
          {historyNote && <ul role="status" className="space-y-0.5 text-xs text-ink-soft">{historyNote.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          <button onClick={pullAcceptedFreight} disabled={pending} className="text-xs font-medium text-brand hover:underline disabled:opacity-50">
            ↳ Use accepted freight quote
          </button>
          {freightNote && (
            <ul role="status" className={`mt-1 space-y-0.5 text-xs ${freightNote.tone === 'ok' ? 'text-green-700' : 'text-amber-800'}`}>
              {freightNote.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}

      {result.excludedLines.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          {result.excludedLines.length} line(s) excluded from cost under {incoterm} (not seller-borne at this Incoterm).
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted">Gross cost/unit</p><p className="text-ink">{result.grossCostPerUnit.toFixed(2)}</p></div>
        <div><p className="text-xs text-muted">RoDTEP credit/unit</p><p className="text-ink">{result.rodtepCreditPerUnit.toFixed(2)}</p></div>
        <div><p className="text-xs text-muted">Landed cost/unit</p><p className="font-semibold text-ink">{result.landedCostPerUnit.toFixed(2)}</p></div>
        <div><p className="text-xs text-muted">Break-even price/unit</p><p className="text-ink">{result.breakEvenPricePerUnit.toFixed(2)}</p></div>
        <div>
          <p className="text-xs text-muted">Price for <input aria-label="Target margin %" type="number" min={0} max={99} value={targetMargin} onChange={(e) => setTargetMargin(Number(e.target.value))} className="w-12 rounded border border-line px-1 text-xs" />% margin</p>
          <p className="text-ink">{priceForTargetMargin(result.landedCostPerUnit, targetMargin)?.toFixed(2) ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Landed margin</p>
          <p className={`font-semibold ${result.landedMarginPct != null && result.landedMarginPct < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {result.landedMarginPct != null ? `${result.landedMarginPct}%` : '—'}
          </p>
        </div>
      </div>

      {canWrite && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save} disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save cost sheet'}
          </button>
          {saved && <p className="text-sm text-green-700">Saved.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
