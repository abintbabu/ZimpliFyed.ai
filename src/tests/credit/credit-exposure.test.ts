import assert from 'node:assert/strict';
import { evaluateCredit, NEAR_LIMIT_RATIO } from '../../lib/credit-exposure';

/** Credit-limit evaluator (pure, no DB): `npm run test:credit`. */

const base = { limitCurrency: 'USD', newAmountCurrency: 'USD' };

// ── No limit set → never warns ────────────────────────────────────────────────
{
  const r = evaluateCredit({ ...base, creditLimit: null, openBalances: [{ currency: 'USD', balanceDue: 500 }], newAmount: 100 });
  assert.equal(r.status, 'no_limit');
  assert.equal(r.headroom, null);
  assert.equal(r.currentExposure, 500);
}
{
  const r = evaluateCredit({ ...base, creditLimit: 0, openBalances: [], newAmount: 100 });
  assert.equal(r.status, 'no_limit', 'a zero limit is treated as unset, not as "block everything"');
}

// ── Status boundaries ─────────────────────────────────────────────────────────
{
  const r = evaluateCredit({ ...base, creditLimit: 10000, openBalances: [{ currency: 'USD', balanceDue: 2000 }], newAmount: 1000 });
  assert.equal(r.status, 'ok');
  assert.equal(r.projectedExposure, 3000);
  assert.equal(r.headroom, 7000);
}
{
  const r = evaluateCredit({ ...base, creditLimit: 10000, openBalances: [{ currency: 'USD', balanceDue: 7000 }], newAmount: 10000 * NEAR_LIMIT_RATIO - 7000 });
  assert.equal(r.status, 'near_limit', 'exactly at 80% of the limit counts as near');
}
{
  const r = evaluateCredit({ ...base, creditLimit: 10000, openBalances: [{ currency: 'USD', balanceDue: 9000 }], newAmount: 1000 });
  assert.equal(r.status, 'near_limit', 'exactly AT the limit is not over it');
  assert.equal(r.headroom, 0);
}
{
  const r = evaluateCredit({ ...base, creditLimit: 10000, openBalances: [{ currency: 'USD', balanceDue: 9000 }], newAmount: 1000.01 });
  assert.equal(r.status, 'over_limit');
  assert.equal(r.headroom, -0.01);
}

// ── Mixed currencies are reported, never summed in ────────────────────────────
{
  const r = evaluateCredit({
    ...base,
    creditLimit: 10000,
    openBalances: [
      { currency: 'USD', balanceDue: 1000 },
      { currency: 'eur', balanceDue: 4000 },
      { currency: 'EUR', balanceDue: 500 },
      { currency: 'GBP', balanceDue: 0 },
    ],
    newAmount: 500,
  });
  assert.equal(r.currentExposure, 1000, 'EUR must not leak into USD exposure');
  assert.deepEqual(r.unconvertedBalances, [{ currency: 'EUR', total: 4500 }], 'case-insensitive grouping; zero balances dropped');
  assert.equal(r.status, 'ok');
}

// ── New amount in a different currency than the limit → cannot evaluate ───────
{
  const r = evaluateCredit({ creditLimit: 10000, limitCurrency: 'USD', newAmountCurrency: 'EUR', openBalances: [{ currency: 'USD', balanceDue: 9500 }], newAmount: 99999 });
  assert.equal(r.status, 'currency_mismatch');
  assert.equal(r.headroom, null);
  assert.equal(r.projectedExposure, 9500, 'the foreign amount is not added to USD exposure');
}

// ── Floating-point drift does not flip a boundary ─────────────────────────────
{
  const r = evaluateCredit({ ...base, creditLimit: 0.3, openBalances: [{ currency: 'USD', balanceDue: 0.1 }], newAmount: 0.2 });
  assert.equal(r.projectedExposure, 0.3);
  assert.notEqual(r.status, 'over_limit', '0.1 + 0.2 must not read as over a 0.3 limit');
}

console.log('✓ credit-exposure: status boundaries, currency isolation, no-limit, rounding');
