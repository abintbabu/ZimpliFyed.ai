'use client';

import { useMemo, useState } from 'react';
import type { CostCategory } from '@prisma/client';
import { INCOTERMS, computeLandedCost } from '@/lib/landed-cost';

const CATEGORIES: { key: CostCategory; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'conversion', label: 'Conversion / labour' },
  { key: 'packing', label: 'Packing' },
  { key: 'inland_freight', label: 'Inland freight' },
  { key: 'cha', label: 'CHA / documentation' },
  { key: 'port', label: 'Port / THC' },
  { key: 'freight', label: 'Ocean/air freight' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'finance_cost', label: 'Finance cost' },
  { key: 'duties', label: 'Duties' },
  { key: 'other', label: 'Other' },
];

export function LandedCostCalculator() {
  const [incoterm, setIncoterm] = useState<string>('FOB');
  const [sellPrice, setSellPrice] = useState('4.25');
  const [rodtep, setRodtep] = useState('1.4');
  const [amounts, setAmounts] = useState<Record<string, string>>({
    material: '2.10', conversion: '0.55', packing: '0.20', inland_freight: '0.12', cha: '0.08', port: '0.10',
  });

  const result = useMemo(() => {
    const lines = CATEGORIES
      .map((c) => ({ category: c.key, amountPerUnit: parseFloat(amounts[c.key] || '0') || 0 }))
      .filter((l) => l.amountPerUnit > 0);
    return computeLandedCost({
      incoterm,
      sellPricePerUnit: parseFloat(sellPrice) || 0,
      rodtepPct: parseFloat(rodtep) || 0,
      lines,
    });
  }, [incoterm, sellPrice, rodtep, amounts]);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-ink">Incoterm</span>
            <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm">
              {INCOTERMS.map((i) => <option key={i}>{i}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink">Sell price / unit</span>
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-ink">RoDTEP %</span>
          <input value={rodtep} onChange={(e) => setRodtep(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </label>
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink">Cost build-up (per unit)</p>
          {CATEGORIES.map((c) => {
            const excluded = result.excludedLines.some((l) => l.category === c.key);
            return (
              <div key={c.key} className={`flex items-center gap-2 ${excluded ? 'opacity-40' : ''}`}>
                <label className="flex-1 text-xs text-ink-soft">{c.label}{excluded && ' (not in Incoterm)'}</label>
                <input
                  value={amounts[c.key] ?? ''}
                  onChange={(e) => setAmounts((a) => ({ ...a, [c.key]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="w-24 rounded-lg border border-line px-2 py-1 text-right text-sm"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-fit rounded-2xl border border-line bg-white p-6">
        <Row label="Gross cost / unit" value={result.grossCostPerUnit} />
        <Row label="RoDTEP credit / unit" value={-result.rodtepCreditPerUnit} />
        <div className="my-3 border-t border-line" />
        <Row label="Landed cost / unit" value={result.landedCostPerUnit} bold />
        <div className="mt-4 rounded-lg bg-brand/5 p-3">
          <p className="text-xs text-muted">Landed margin</p>
          <p className="text-2xl font-semibold text-brand">
            {result.landedMarginPct != null ? `${result.landedMarginPct.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${bold ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{value.toFixed(2)}</span>
    </div>
  );
}
