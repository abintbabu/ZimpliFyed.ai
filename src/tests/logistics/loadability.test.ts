import assert from 'node:assert/strict';
import { fitCartons, fitPallet, fitPalletsInContainer, planLoad, describeMix, CONTAINER_SPECS, PALLET_ISO, LCL_THRESHOLD_CBM } from '../../lib/loadability';

/** Loadability engine (pure): `npm run test:loadability`. */

const c20 = CONTAINER_SPECS['20GP'], c40 = CONTAINER_SPECS['40GP'], c40hc = CONTAINER_SPECS['40HC'];
const carton = (o: Partial<{ lengthCm: number; widthCm: number; heightCm: number; grossWeightKg: number }> = {}) => ({ lengthCm: 60, widthCm: 40, heightCm: 40, grossWeightKg: 20, ...o });

// ── fitCartons ──────────────────────────────────────────────────────────────
{
  // 60×40×40 in a 20GP (589.8 × 235.2 × 239.3): best grid — hand-checked below.
  const f = fitCartons(carton(), c20);
  // orientation (60,40,40): 9 × 5 × 5 = 225; (40,60,40): 14 × 3 × 5 = 210; (60,40,40) rotated heights give 5 layers (239/40=5)
  assert.equal(f.byVolume, 225, '9 along × 5 across × 5 high');
  assert.equal(f.byWeight, 1400);
  assert.equal(f.fit, 225); assert.equal(f.limitedBy, 'space');
  assert.equal(f.utilizationPct, Math.round((225 * 0.096 / (5.898 * 2.352 * 2.393)) * 1000) / 10);
}
// weight binds for dense cartons
{
  const f = fitCartons(carton({ grossWeightKg: 200 }), c20);
  assert.equal(f.byWeight, 140); assert.equal(f.fit, 140); assert.equal(f.limitedBy, 'weight');
}
// 40HC holds strictly more than 40GP for a tall carton (extra height = extra layer)
assert.ok(fitCartons(carton({ heightCm: 50 }), c40hc).fit > fitCartons(carton({ heightCm: 50 }), c40).fit);
// upright restriction can only reduce (never increase) the count
for (const dims of [{ lengthCm: 70, widthCm: 30, heightCm: 55 }, { lengthCm: 45, widthCm: 45, heightCm: 80 }]) {
  assert.ok(fitCartons(carton(dims), c40, { upright: true }).fit <= fitCartons(carton(dims), c40, { upright: false }).fit);
}
// a tall carton that only fits laid down is found when rotation is allowed, and refused when upright-only
assert.equal(fitCartons(carton({ lengthCm: 50, widthCm: 50, heightCm: 260 }), c20, { upright: true }).fit, 0, 'taller than the container when upright');
assert.ok(fitCartons(carton({ lengthCm: 50, widthCm: 50, heightCm: 260 }), c20, { upright: false }).fit > 0);
assert.equal(fitCartons(carton({ lengthCm: 700, widthCm: 50, heightCm: 50 }), c20).fit, 0, 'longer than any container side');
assert.throws(() => fitCartons(carton({ lengthCm: 0 }), c20), /dimensions/);
assert.throws(() => fitCartons(carton({ grossWeightKg: 0 }), c20), /weight/);

// ── fitPallet ───────────────────────────────────────────────────────────────
{
  const p = fitPallet(carton({ lengthCm: 40, widthCm: 30, heightCm: 25, grossWeightKg: 8 }));
  // ISO 120×100, 135 cm usable height. Flat (40×30 footprint, 25 high): 9/layer × 5 = 45.
  // Best is on the 40×25 face (30 high): 3 × 4 = 12/layer × 4 layers = 48 — and it fills the deck exactly.
  assert.equal(p.cartonsPerLayer, 12); assert.equal(p.layers, 4); assert.equal(p.cartonsPerPallet, 48); assert.equal(p.limitedBy, 'space');
  assert.equal(p.loadedHeightCm, 15 + 4 * 30); assert.equal(p.grossPalletKg, 25 + 48 * 8);
  assert.equal(p.deckUtilizationPct, 100);
}
{
  const p = fitPallet(carton({ lengthCm: 40, widthCm: 30, heightCm: 25, grossWeightKg: 40 }));
  assert.equal(p.limitedBy, 'weight'); assert.equal(p.cartonsPerPallet, 25, '1000 kg ÷ 40 kg');
  assert.equal(p.loadedHeightCm, 15 + 3 * 30, 'a weight-limited pallet is only built as high as its cartons need (25 cartons = 3 layers of 12)');
}

// ── pallets in a container ──────────────────────────────────────────────────
{
  const r = fitPalletsInContainer(carton({ lengthCm: 40, widthCm: 30, heightCm: 25, grossWeightKg: 8 }), c20);
  // 20GP floor: (120,100): 4 × 2 = 8 ; (100,120): 5 × 1 = 5 → 8 pallets, 48 cartons each
  assert.equal(r.pallets, 8); assert.equal(r.cartons, 8 * 48);
  // a pallet loaded taller than the container roof cannot be loaded
  const tall = fitPalletsInContainer(carton({ lengthCm: 40, widthCm: 30, heightCm: 25, grossWeightKg: 8 }), { ...c20, heightCm: 100 });
  assert.equal(tall.pallets, 0);
}

// ── planLoad: single carton size ────────────────────────────────────────────
{
  const plan = planLoad([{ ...carton(), count: 225 }]);
  assert.equal(plan.method, 'exact'); assert.equal(plan.totalCartons, 225); assert.equal(plan.totalCbm, 21.6);
  assert.equal(describeMix(plan.mix), '1 × 20GP', 'exactly one 20GP, the cheapest that holds it');
  assert.equal(plan.containerCount, 1);
  assert.equal(plan.lcl.advisable, false);
}
{
  const plan = planLoad([{ ...carton(), count: 226 }]);   // one over a 20GP → needs a bigger/more containers
  assert.ok(plan.containerCount >= 1);
  const cap = plan.capacity;
  const covered = Object.entries(plan.mix!).reduce((s, [t, n]) => s + n! * cap[t as keyof typeof cap]!.fit, 0);
  assert.ok(covered >= 226, 'the chosen mix really holds every carton');
  // and no cheaper single-type alternative exists
  const cost = (mix: Record<string, number>) => Object.entries(mix).reduce((s, [t, n]) => s + n * CONTAINER_SPECS[t as keyof typeof CONTAINER_SPECS].costWeight, 0);
  const chosen = cost(plan.mix as Record<string, number>);
  for (const t of ['20GP', '40GP', '40HC'] as const) {
    const n = Math.ceil(226 / cap[t]!.fit);
    assert.ok(chosen <= cost({ [t]: n }) + 1e-9, `chosen mix is no worse than ${n} × ${t}`);
  }
}
{
  const plan = planLoad([{ ...carton(), count: 1000 }]);
  const covered = Object.entries(plan.mix!).reduce((s, [t, n]) => s + n! * plan.capacity[t as '20GP']!.fit, 0);
  assert.ok(covered >= 1000); assert.ok(plan.utilizationPct! > 50 && plan.utilizationPct! <= 100);
}
// small order → LCL advice, still planned
{
  const plan = planLoad([{ ...carton(), count: 50 }]);
  assert.equal(plan.lcl.advisable, true); assert.ok(plan.totalCbm < LCL_THRESHOLD_CBM); assert.match(plan.lcl.reason, /LCL/);
}
// carton too big for anything → no mix, with a warning
{
  const plan = planLoad([{ lengthCm: 800, widthCm: 300, heightCm: 300, grossWeightKg: 50, count: 1 }]);
  assert.equal(plan.mix, null); assert.equal(plan.containerCount, 0); assert.match(plan.warnings[0], /do not fit/); assert.equal(describeMix(plan.mix), 'No standard container fits');
}
// restricting container types is honoured
{
  const plan = planLoad([{ ...carton(), count: 300 }], { types: ['20GP'] });
  assert.deepEqual(Object.keys(plan.mix!), ['20GP']); assert.equal(plan.mix!['20GP'], 2);
}

// ── planLoad: mixed sizes → honest estimate ─────────────────────────────────
{
  const plan = planLoad([{ ...carton(), count: 300 }, { lengthCm: 50, widthCm: 50, heightCm: 30, grossWeightKg: 12, count: 200 }]);
  assert.equal(plan.method, 'estimate'); assert.match(plan.warnings[0], /not a loading plan/);
  assert.deepEqual(plan.capacity, {});
  const vol = 300 * 0.096 + 200 * 0.075;
  assert.equal(plan.totalCbm, Math.round(vol * 1000) / 1000);
  const usable = Object.entries(plan.mix!).reduce((s, [t, n]) => s + n! * (CONTAINER_SPECS[t as '20GP'].lengthCm * CONTAINER_SPECS[t as '20GP'].widthCm * CONTAINER_SPECS[t as '20GP'].heightCm / 1e6) * 0.85, 0);
  assert.ok(usable >= vol, 'estimate still covers the volume after the efficiency haircut');
}
// heavy mixed cargo is weight-bound
{
  const plan = planLoad([{ lengthCm: 30, widthCm: 30, heightCm: 30, grossWeightKg: 90, count: 400 }, { lengthCm: 31, widthCm: 30, heightCm: 30, grossWeightKg: 90, count: 400 }]);
  assert.equal(plan.method, 'estimate'); assert.ok(plan.containerCount >= Math.ceil(plan.totalGrossKg / 28_000), 'payload limit respected');
}
assert.throws(() => planLoad([]), /at least one/);
assert.throws(() => planLoad([{ ...carton(), count: 0 }]), /at least one/);

console.log('✓ loadability: cartons, pallets, container mix, LCL advice, mixed-size estimate');
