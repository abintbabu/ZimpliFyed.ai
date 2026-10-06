// Carton-level packing data (M2). Pure — no DB. The packing list prints these figures, so the arithmetic
// lives in one tested place: CBM and totals are always derived from the per-carton inputs, never stored,
// so they cannot drift from the numbers a CHA reads.

export type PackingEntryInput = {
  /** Description of the goods in these cartons (resolved from the order line when linked). */
  description?: string | null;
  marks?: string | null;
  cartonCount: number;
  qtyPerCarton: number;
  /** Per carton, kg. */
  netWeightKg: number;
  grossWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type PackingCartonRow = {
  description: string | null;
  marks: string | null;
  /** Carton serial range printed on the list, e.g. "1-10" or "11". */
  cartonRange: string;
  cartonCount: number;
  qtyPerCarton: number;
  totalQty: number;
  netWeightKg: number;
  grossWeightKg: number;
  totalNetKg: number;
  totalGrossKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Volume of ONE carton, m³. */
  cbmPerCarton: number;
  totalCbm: number;
};

export type PackingTotals = {
  cartons: number;
  quantity: number;
  netWeightKg: number;
  grossWeightKg: number;
  cbm: number;
};

const r = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Volume of one carton in m³ from centimetre dimensions. */
export function cartonCbm(lengthCm: number, widthCm: number, heightCm: number): number {
  return r((lengthCm * widthCm * heightCm) / 1_000_000, 4);
}

/** Throws a message naming the first invalid entry; the caller surfaces it verbatim. */
export function validatePackingEntries(entries: PackingEntryInput[]): void {
  entries.forEach((e, i) => {
    const at = `Packing row ${i + 1}`;
    if (!Number.isInteger(e.cartonCount) || e.cartonCount <= 0) throw new Error(`${at}: carton count must be a whole number above 0`);
    if (!(e.qtyPerCarton > 0)) throw new Error(`${at}: quantity per carton must be above 0`);
    if (!(e.netWeightKg > 0) || !(e.grossWeightKg > 0)) throw new Error(`${at}: net and gross weight must be above 0`);
    if (e.grossWeightKg < e.netWeightKg) throw new Error(`${at}: gross weight (${e.grossWeightKg} kg) cannot be less than net weight (${e.netWeightKg} kg)`);
    if (!(e.lengthCm > 0) || !(e.widthCm > 0) || !(e.heightCm > 0)) throw new Error(`${at}: carton dimensions must all be above 0`);
  });
}

/** Derives printable rows (with sequential carton ranges) and grand totals. Input is assumed valid. */
export function summarizePacking(entries: PackingEntryInput[]): { rows: PackingCartonRow[]; totals: PackingTotals } {
  let next = 1;
  const rows = entries.map((e) => {
    const start = next;
    const end = next + e.cartonCount - 1;
    next = end + 1;
    const perCbm = cartonCbm(e.lengthCm, e.widthCm, e.heightCm);
    return {
      description: e.description ?? null,
      marks: e.marks?.trim() || null,
      cartonRange: start === end ? String(start) : `${start}-${end}`,
      cartonCount: e.cartonCount,
      qtyPerCarton: e.qtyPerCarton,
      totalQty: r(e.cartonCount * e.qtyPerCarton, 3),
      netWeightKg: e.netWeightKg,
      grossWeightKg: e.grossWeightKg,
      totalNetKg: r(e.cartonCount * e.netWeightKg, 2),
      totalGrossKg: r(e.cartonCount * e.grossWeightKg, 2),
      lengthCm: e.lengthCm,
      widthCm: e.widthCm,
      heightCm: e.heightCm,
      cbmPerCarton: perCbm,
      totalCbm: r(e.cartonCount * ((e.lengthCm * e.widthCm * e.heightCm) / 1_000_000), 3),
    };
  });

  return {
    rows,
    totals: {
      cartons: rows.reduce((s, x) => s + x.cartonCount, 0),
      quantity: r(rows.reduce((s, x) => s + x.totalQty, 0), 3),
      netWeightKg: r(rows.reduce((s, x) => s + x.totalNetKg, 0), 2),
      grossWeightKg: r(rows.reduce((s, x) => s + x.totalGrossKg, 0), 2),
      cbm: r(rows.reduce((s, x) => s + x.totalCbm, 0), 3),
    },
  };
}
