'use client';

import { useMemo, useState } from 'react';
import { planLoad, describeMix, CONTAINER_SPECS, fitPalletsInContainer, type CartonGroup, type ContainerTypeId } from '@/lib/loadability';

type Entry = { cartonCount: number; lengthCm: number; widthCm: number; heightCm: number; grossWeightKg: number };

/** Container planner over an order's saved packing rows: which containers, how full, and whether LCL is smarter. */
export function LoadPlannerPanel({ entries }: { entries: Entry[] }) {
  const [upright, setUpright] = useState(true);
  const [types, setTypes] = useState<ContainerTypeId[]>(['20GP', '40GP', '40HC']);

  // Rows with identical dimensions and weight are one carton group.
  const groups = useMemo<CartonGroup[]>(() => {
    const m = new Map<string, CartonGroup>();
    for (const e of entries) {
      if (!(e.cartonCount > 0 && e.lengthCm > 0 && e.widthCm > 0 && e.heightCm > 0 && e.grossWeightKg > 0)) continue;
      const key = `${e.lengthCm}x${e.widthCm}x${e.heightCm}@${e.grossWeightKg}`;
      const g = m.get(key);
      if (g) g.count += e.cartonCount; else m.set(key, { lengthCm: e.lengthCm, widthCm: e.widthCm, heightCm: e.heightCm, grossWeightKg: e.grossWeightKg, count: e.cartonCount });
    }
    return [...m.values()];
  }, [entries]);

  const plan = useMemo(() => (groups.length && types.length ? planLoad(groups, { upright, types }) : null), [groups, upright, types]);
  if (groups.length === 0) return null;

  const toggle = (t: ContainerTypeId) => setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const pallet = groups.length === 1 && plan?.mix ? fitPalletsInContainer(groups[0], CONTAINER_SPECS['20GP'], undefined, { upright }) : null;

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <h2 className="text-sm font-semibold text-ink">Container planner</h2>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        {(['20GP', '40GP', '40HC'] as ContainerTypeId[]).map((t) => (
          <label key={t} className="flex items-center gap-1"><input type="checkbox" checked={types.includes(t)} onChange={() => toggle(t)} />{t}</label>
        ))}
        <label className="flex items-center gap-1"><input type="checkbox" checked={upright} onChange={(e) => setUpright(e.target.checked)} />Cartons must stay upright</label>
      </div>
      {!plan ? <p className="text-sm text-muted">Select at least one container type.</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted">Suggested</p><p className="font-semibold text-ink">{describeMix(plan.mix)}</p></div>
            <div><p className="text-xs text-muted">Cartons / volume</p><p className="text-ink">{plan.totalCartons} · {plan.totalCbm} CBM</p></div>
            <div><p className="text-xs text-muted">Gross weight</p><p className="text-ink">{plan.totalGrossKg.toLocaleString()} kg</p></div>
            <div><p className="text-xs text-muted">Space used</p><p className="text-ink">{plan.utilizationPct == null ? '—' : `${plan.utilizationPct}%`}</p></div>
          </div>
          {plan.method === 'exact' && (
            <p className="text-xs text-muted">Capacity per container: {(Object.entries(plan.capacity) as [ContainerTypeId, NonNullable<(typeof plan.capacity)[ContainerTypeId]>][]).map(([t, c]) => `${t} ${c.fit} (${c.limitedBy}-limited)`).join(' · ')}</p>
          )}
          {pallet && pallet.pallets > 0 && <p className="text-xs text-muted">Palletised in a 20GP: {pallet.pallets} pallets × {pallet.pallet.cartonsPerPallet} cartons = {pallet.cartons} (ISO 1200×1000, {pallet.pallet.loadedHeightCm} cm loaded).</p>}
          <p className={`text-sm ${plan.lcl.advisable ? 'text-amber-800' : 'text-muted'}`}>{plan.lcl.reason}</p>
          {plan.warnings.map((w, i) => <p key={i} role="alert" className="text-xs text-amber-800">⚠ {w}</p>)}
          <p className="text-xs text-muted">Nominal internal dimensions on a straight-grid packing model — an upper bound. Real loading loses space to dunnage and door clearance.</p>
        </>
      )}
    </section>
  );
}
