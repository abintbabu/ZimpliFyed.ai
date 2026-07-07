'use client';

import { useMemo, useState, useTransition } from 'react';
import { saveCostSheet } from '@/actions/cost-sheets';
import { computeLandedCost, INCOTERMS } from '@/lib/landed-cost';
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

      {result.excludedLines.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          {result.excludedLines.length} line(s) excluded from cost under {incoterm} (not seller-borne at this Incoterm).
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted">Gross cost/unit</p><p className="text-ink">{result.grossCostPerUnit.toFixed(2)}</p></div>
        <div><p className="text-xs text-muted">RoDTEP credit/unit</p><p className="text-ink">{result.rodtepCreditPerUnit.toFixed(2)}</p></div>
        <div><p className="text-xs text-muted">Landed cost/unit</p><p className="font-semibold text-ink">{result.landedCostPerUnit.toFixed(2)}</p></div>
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
