// Container & pallet loadability (V2). Pure — no DB.
//
// Answers the question every exporter works out in a spreadsheet: how many of these cartons go in a 20' /
// 40' / 40'HC, what limits it (space or weight), and what's the cheapest set of containers for the whole
// order. Figures are NOMINAL internal dimensions and a straight-grid packing model — real loading loses space
// to dunnage, door clearance and irregular stacking, so every result is an upper bound and says so.
//
// Single carton size: exact grid count over the best orientation. Mixed sizes: a volume/weight ESTIMATE with an
// efficiency haircut, flagged `method: 'estimate'` — it must never be presented as a loading plan.

export type Dim3 = { lengthCm: number; widthCm: number; heightCm: number };

export type Carton = Dim3 & { grossWeightKg: number };

export type ContainerTypeId = '20GP' | '40GP' | '40HC';

export type ContainerSpec = Dim3 & { id: ContainerTypeId; label: string; maxPayloadKg: number; /** Relative freight cost weight for choosing between mixes. */ costWeight: number };

/** Nominal internal dimensions; carriers and container builds vary by a few centimetres. */
export const CONTAINER_SPECS: Record<ContainerTypeId, ContainerSpec> = {
  '20GP': { id: '20GP', label: "20' General Purpose", lengthCm: 589.8, widthCm: 235.2, heightCm: 239.3, maxPayloadKg: 28_000, costWeight: 1 },
  '40GP': { id: '40GP', label: "40' General Purpose", lengthCm: 1203.2, widthCm: 235.2, heightCm: 239.3, maxPayloadKg: 26_700, costWeight: 1.8 },
  '40HC': { id: '40HC', label: "40' High Cube", lengthCm: 1203.2, widthCm: 235.2, heightCm: 269.8, maxPayloadKg: 26_500, costWeight: 1.9 },
};

export type PalletSpec = { lengthCm: number; widthCm: number; deckHeightCm: number; tareKg: number; maxLoadKg: number; maxStackHeightCm: number };

/** ISO 1200×1000 pallet, 15 cm deck, 1.5 m loaded height — the common export default. */
export const PALLET_ISO: PalletSpec = { lengthCm: 120, widthCm: 100, deckHeightCm: 15, tareKg: 25, maxLoadKg: 1000, maxStackHeightCm: 150 };

const volCbm = (d: Dim3) => (d.lengthCm * d.widthCm * d.heightCm) / 1_000_000;
const round = (n: number, dp = 2) => Math.round((n + Number.EPSILON) * 10 ** dp) / 10 ** dp;

/** Orientations of a carton as [l, w, h]. `upright` keeps the height vertical (only the footprint rotates). */
function orientations(c: Dim3, upright: boolean): [number, number, number][] {
  const { lengthCm: l, widthCm: w, heightCm: h } = c;
  if (upright) return [[l, w, h], [w, l, h]];
  return [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]];
}

export type FitResult = {
  /** Cartons that fit, by the tighter of space and weight. */
  fit: number;
  byVolume: number;
  byWeight: number;
  limitedBy: 'space' | 'weight';
  /** Share of the container's volume the cartons occupy (0–100). */
  utilizationPct: number;
  orientation: { lengthCm: number; widthCm: number; heightCm: number };
};

export function fitCartons(carton: Carton, container: ContainerSpec, opts: { upright?: boolean } = {}): FitResult {
  if (!(carton.lengthCm > 0 && carton.widthCm > 0 && carton.heightCm > 0)) throw new Error('Carton dimensions must all be above 0');
  if (!(carton.grossWeightKg > 0)) throw new Error('Carton gross weight must be above 0');

  let best = { count: 0, o: [0, 0, 0] as [number, number, number] };
  for (const o of orientations(carton, opts.upright ?? false)) {
    const count = Math.floor(container.lengthCm / o[0]) * Math.floor(container.widthCm / o[1]) * Math.floor(container.heightCm / o[2]);
    if (count > best.count) best = { count, o };
  }
  const byWeight = Math.floor(container.maxPayloadKg / carton.grossWeightKg);
  const fit = Math.min(best.count, byWeight);
  return {
    fit,
    byVolume: best.count,
    byWeight,
    limitedBy: byWeight < best.count ? 'weight' : 'space',
    utilizationPct: round((fit * volCbm(carton) * 1_000_000) / (container.lengthCm * container.widthCm * container.heightCm) * 100, 1),
    orientation: { lengthCm: best.o[0], widthCm: best.o[1], heightCm: best.o[2] },
  };
}

export type PalletFit = {
  cartonsPerLayer: number;
  layers: number;
  cartonsPerPallet: number;
  limitedBy: 'space' | 'weight';
  loadedHeightCm: number;
  grossPalletKg: number;
  /** Footprint utilisation of the pallet deck by cartons (0–100). */
  deckUtilizationPct: number;
};

export function fitPallet(carton: Carton, pallet: PalletSpec = PALLET_ISO, opts: { upright?: boolean } = {}): PalletFit {
  const usableHeight = pallet.maxStackHeightCm - pallet.deckHeightCm;
  let best = { perLayer: 0, layers: 0, total: 0, o: [0, 0, 0] as [number, number, number] };
  for (const o of orientations(carton, opts.upright ?? false)) {
    const perLayer = Math.floor(pallet.lengthCm / o[0]) * Math.floor(pallet.widthCm / o[1]);
    const layers = Math.floor(usableHeight / o[2]);
    if (perLayer * layers > best.total) best = { perLayer, layers, total: perLayer * layers, o };
  }
  const byWeight = Math.floor(pallet.maxLoadKg / carton.grossWeightKg);
  const cartonsPerPallet = Math.min(best.total, byWeight);
  const layersUsed = best.perLayer > 0 ? Math.ceil(cartonsPerPallet / best.perLayer) : 0;
  return {
    cartonsPerLayer: best.perLayer,
    layers: best.layers,
    cartonsPerPallet,
    limitedBy: byWeight < best.total ? 'weight' : 'space',
    loadedHeightCm: round(pallet.deckHeightCm + layersUsed * best.o[2], 1),
    grossPalletKg: round(pallet.tareKg + cartonsPerPallet * carton.grossWeightKg, 1),
    deckUtilizationPct: round(((best.perLayer * best.o[0] * best.o[1]) / (pallet.lengthCm * pallet.widthCm)) * 100, 1),
  };
}

/** Palletised loading: how many pallets stand on the container floor (single tier) and the cartons they carry. */
export function fitPalletsInContainer(carton: Carton, container: ContainerSpec, pallet: PalletSpec = PALLET_ISO, opts: { upright?: boolean } = {}) {
  const p = fitPallet(carton, pallet, opts);
  if (p.cartonsPerPallet === 0) return { pallets: 0, cartons: 0, pallet: p, limitedBy: 'space' as const };
  // Pallets stand on the floor; the loaded pallet must clear the container roof.
  if (p.loadedHeightCm > container.heightCm) return { pallets: 0, cartons: 0, pallet: p, limitedBy: 'space' as const };
  const floorA = Math.floor(container.lengthCm / pallet.lengthCm) * Math.floor(container.widthCm / pallet.widthCm);
  const floorB = Math.floor(container.lengthCm / pallet.widthCm) * Math.floor(container.widthCm / pallet.lengthCm);
  const bySpace = Math.max(floorA, floorB);
  const byWeight = Math.floor(container.maxPayloadKg / p.grossPalletKg);
  const pallets = Math.min(bySpace, byWeight);
  return { pallets, cartons: pallets * p.cartonsPerPallet, pallet: p, limitedBy: (byWeight < bySpace ? 'weight' : 'space') as 'space' | 'weight' };
}

// ── Whole-order planning ─────────────────────────────────────────────────────

export type CartonGroup = Carton & { count: number };

export type ContainerMix = Partial<Record<ContainerTypeId, number>>;

export type LoadPlan = {
  /** 'exact' = single carton size on a straight grid; 'estimate' = mixed sizes, volume/weight only. */
  method: 'exact' | 'estimate';
  totalCartons: number;
  totalCbm: number;
  totalGrossKg: number;
  /** Cheapest container mix that holds everything, or null when nothing fits (carton larger than a container). */
  mix: ContainerMix | null;
  containerCount: number;
  /** Average volume utilisation across the chosen containers (0–100). */
  utilizationPct: number | null;
  /** Per-container capacity used to build the mix (cartons), exact method only. */
  capacity: Partial<Record<ContainerTypeId, FitResult>>;
  lcl: { advisable: boolean; reason: string };
  warnings: string[];
};

/** Below this volume a part-load (LCL) usually beats paying for a 20' — a rule of thumb, not a quote. */
export const LCL_THRESHOLD_CBM = 15;
/** Haircut applied to volume in the estimate method for dunnage, door gaps and mixed stacking. */
export const ESTIMATE_EFFICIENCY = 0.85;

/** Searches container mixes (bounded) for the lowest cost weight that covers `needed` units of capacity. */
function cheapestMix(needed: number, capacityPerType: Partial<Record<ContainerTypeId, number>>): ContainerMix | null {
  const types = (Object.keys(capacityPerType) as ContainerTypeId[]).filter((t) => (capacityPerType[t] ?? 0) > 0);
  if (types.length === 0) return null;
  const maxEach = Math.min(40, Math.ceil(needed / Math.min(...types.map((t) => capacityPerType[t]!))) + 1);
  let best: { mix: ContainerMix; cost: number; count: number } | null = null;

  const walk = (i: number, mix: ContainerMix, cap: number, cost: number, count: number) => {
    if (i === types.length) {
      if (cap >= needed && count > 0 && (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && count < best.count))) best = { mix: { ...mix }, cost, count };
      return;
    }
    const t = types[i];
    for (let n = 0; n <= maxEach; n++) {
      const next = { ...mix, ...(n > 0 ? { [t]: n } : {}) };
      walk(i + 1, next, cap + n * capacityPerType[t]!, cost + n * CONTAINER_SPECS[t].costWeight, count + n);
      if (cap + n * capacityPerType[t]! >= needed) break; // adding more of this type only adds cost
    }
  };
  walk(0, {}, 0, 0, 0);
  return (best as { mix: ContainerMix } | null)?.mix ?? null;
}

export function planLoad(groups: CartonGroup[], opts: { upright?: boolean; types?: ContainerTypeId[] } = {}): LoadPlan {
  const groupsClean = groups.filter((g) => g.count > 0);
  if (groupsClean.length === 0) throw new Error('Add at least one carton group');
  const types = opts.types ?? (['20GP', '40GP', '40HC'] as ContainerTypeId[]);
  const warnings: string[] = [];

  const totalCartons = groupsClean.reduce((s, g) => s + g.count, 0);
  const totalCbm = round(groupsClean.reduce((s, g) => s + g.count * volCbm(g), 0), 3);
  const totalGrossKg = round(groupsClean.reduce((s, g) => s + g.count * g.grossWeightKg, 0), 1);
  const lcl = totalCbm < LCL_THRESHOLD_CBM
    ? { advisable: true, reason: `${totalCbm} CBM is under ~${LCL_THRESHOLD_CBM} CBM — a part-load (LCL) is usually cheaper than a full container. Compare quotes.` }
    : { advisable: false, reason: `${totalCbm} CBM justifies a full container.` };

  const sameSize = groupsClean.every((g) => g.lengthCm === groupsClean[0].lengthCm && g.widthCm === groupsClean[0].widthCm && g.heightCm === groupsClean[0].heightCm && g.grossWeightKg === groupsClean[0].grossWeightKg);

  if (sameSize) {
    const carton = groupsClean[0];
    const capacity: Partial<Record<ContainerTypeId, FitResult>> = {};
    const per: Partial<Record<ContainerTypeId, number>> = {};
    for (const t of types) {
      const f = fitCartons(carton, CONTAINER_SPECS[t], { upright: opts.upright });
      capacity[t] = f;
      per[t] = f.fit;
    }
    const mix = cheapestMix(totalCartons, per);
    if (!mix) warnings.push('These cartons do not fit in any standard container (too large or too heavy).');
    const containerCount = mix ? Object.values(mix).reduce((s, n) => s + (n ?? 0), 0) : 0;
    const usedVol = mix ? (Object.keys(mix) as ContainerTypeId[]).reduce((s, t) => s + mix[t]! * volCbm(CONTAINER_SPECS[t]), 0) : 0;
    return { method: 'exact', totalCartons, totalCbm, totalGrossKg, mix, containerCount, utilizationPct: usedVol > 0 ? round((totalCbm / usedVol) * 100, 1) : null, capacity, lcl, warnings };
  }

  // Mixed carton sizes → estimate from volume and weight only.
  warnings.push('Mixed carton sizes: this is a volume/weight estimate, not a loading plan. Confirm with your forwarder.');
  const per: Partial<Record<ContainerTypeId, number>> = {};
  for (const t of types) {
    const c = CONTAINER_SPECS[t];
    // Capacity measured in "cbm-equivalents": usable volume, reduced further if weight binds first.
    const byVol = volCbm(c) * ESTIMATE_EFFICIENCY;
    const byWeight = (c.maxPayloadKg / totalGrossKg) * totalCbm;
    per[t] = Math.min(byVol, byWeight);
  }
  const mix = cheapestMix(totalCbm, per);
  const containerCount = mix ? Object.values(mix).reduce((s, n) => s + (n ?? 0), 0) : 0;
  const usedVol = mix ? (Object.keys(mix) as ContainerTypeId[]).reduce((s, t) => s + mix[t]! * volCbm(CONTAINER_SPECS[t]), 0) : 0;
  return { method: 'estimate', totalCartons, totalCbm, totalGrossKg, mix, containerCount, utilizationPct: usedVol > 0 ? round((totalCbm / usedVol) * 100, 1) : null, capacity: {}, lcl, warnings };
}

/** One-line human summary of a mix, e.g. "1 × 40'HC + 1 × 20'GP". */
export function describeMix(mix: ContainerMix | null): string {
  if (!mix) return 'No standard container fits';
  const order: ContainerTypeId[] = ['40HC', '40GP', '20GP'];
  return order.filter((t) => mix[t]).map((t) => `${mix[t]} × ${t}`).join(' + ');
}
