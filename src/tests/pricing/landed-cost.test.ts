import assert from 'node:assert/strict';
import {
  isIncoterm,
  INCOTERMS,
  INCOTERM_INCLUDED_CATEGORIES,
  computeLandedCost,
  computeVendorQuoteLandedCost,
} from '../../lib/landed-cost';

/**
 * Landed-cost engine (Incoterm-aware). Pure, no DB: `npm run test:landed-cost`.
 * Verifies which cost categories each Incoterm makes the seller responsible for,
 * the RODTEP credit, landed margin%, and the vendor-quote comparison basis.
 */

// ── Incoterm guard ───────────────────────────────────────────────────────────
assert.equal(isIncoterm('FOB'), true);
assert.equal(isIncoterm('fob'), false, 'guard is case-sensitive');
assert.equal(isIncoterm('BOGUS'), false);

// ── Category nesting is a strict superset chain EXW ⊂ … ⊂ DDP ─────────────────
for (let i = 1; i < INCOTERMS.length; i++) {
  const prev = INCOTERM_INCLUDED_CATEGORIES[INCOTERMS[i - 1]];
  const curr = INCOTERM_INCLUDED_CATEGORIES[INCOTERMS[i]];
  assert.ok(curr.length > prev.length, `${INCOTERMS[i]} should include more than ${INCOTERMS[i - 1]}`);
  assert.ok(prev.every((c) => curr.includes(c)), `${INCOTERMS[i]} must be a superset of ${INCOTERMS[i - 1]}`);
}

// ── computeLandedCost: FOB excludes freight/insurance/duties ──────────────────
{
  const r = computeLandedCost({
    incoterm: 'FOB',
    sellPricePerUnit: 100,
    rodtepPct: 0,
    lines: [
      { category: 'material', amountPerUnit: 40 },
      { category: 'conversion', amountPerUnit: 10 },
      { category: 'freight', amountPerUnit: 25 }, // excluded under FOB
      { category: 'insurance', amountPerUnit: 5 }, // excluded under FOB
    ],
  });
  assert.equal(r.grossCostPerUnit, 50, 'only material+conversion count under FOB');
  assert.equal(r.landedCostPerUnit, 50);
  assert.equal(r.landedMarginPct, 50, '(100-50)/100');
  assert.deepEqual(
    r.excludedLines.map((l) => l.category).sort(),
    ['freight', 'insurance'],
  );
}

// ── RODTEP credit reduces landed cost ─────────────────────────────────────────
{
  const r = computeLandedCost({
    incoterm: 'CIF',
    sellPricePerUnit: 0,
    rodtepPct: 10,
    lines: [{ category: 'material', amountPerUnit: 100 }],
  });
  assert.equal(r.rodtepCreditPerUnit, 10);
  assert.equal(r.landedCostPerUnit, 90);
  assert.equal(r.landedMarginPct, undefined, 'no sell price → undefined margin');
}

// ── Unknown incoterm → all lines included, nothing excluded ───────────────────
{
  const r = computeLandedCost({
    incoterm: 'ZZZ',
    sellPricePerUnit: 0,
    rodtepPct: 0,
    lines: [{ category: 'freight', amountPerUnit: 30 }],
  });
  assert.equal(r.grossCostPerUnit, 30);
  assert.equal(r.excludedLines.length, 0);
}

// ── Vendor-quote comparison: rate is material; add-ons only for uncovered stages
{
  // Vendor quotes FOB, we compare at DDP. Freight (a CFR/DDP stage, not covered
  // by an FOB rate) should be added; packing (covered by FOB) should be dropped.
  const r = computeVendorQuoteLandedCost({
    quoteIncoterm: 'FOB',
    comparisonIncoterm: 'DDP',
    rate: 100,
    addOns: [
      { category: 'freight', amountPerUnit: 20 },
      { category: 'packing', amountPerUnit: 5 }, // covered by FOB rate → dropped
      { category: 'duties', amountPerUnit: 0 }, // zero → dropped
    ],
  });
  assert.equal(r.grossCostPerUnit, 120, 'rate 100 + freight 20');
  assert.equal(r.rodtepCreditPerUnit, 0, 'RODTEP omitted in vendor comparison');
}

console.log('✓ landed-cost: Incoterm superset chain, category filtering, RODTEP, vendor comparison');
