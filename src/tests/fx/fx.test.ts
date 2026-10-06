import assert from 'node:assert/strict';
import { latestRates, convertToBase, convertBetween, planReporting, validateRateEntry } from '../../lib/fx';

/** FX helpers (pure): `npm run test:fx`. */

const d = (s: string) => new Date(s);

// latestRates: newest asOf wins per currency, case-insensitive, base pinned to 1, junk ignored
{
  const rates = latestRates([
    { currency: 'usd', rateToBase: 82, asOf: d('2026-09-01') },
    { currency: 'USD', rateToBase: 84.5, asOf: d('2026-10-01') },
    { currency: 'USD', rateToBase: 80, asOf: d('2026-08-01') },
    { currency: 'EUR', rateToBase: 91, asOf: d('2026-10-02') },
    { currency: 'GBP', rateToBase: 0, asOf: d('2026-10-02') },
    { currency: 'JPY', rateToBase: NaN, asOf: d('2026-10-02') },
    { currency: 'INR', rateToBase: 5, asOf: d('2026-10-02') },
  ]);
  assert.deepEqual(rates, { INR: 1, USD: 84.5, EUR: 91 });
}

// convertToBase
const rates = { INR: 1, USD: 84.5, EUR: 91 };
assert.equal(convertToBase(100, 'usd', rates), 8450);
assert.equal(convertToBase(100, 'INR', rates), 100);
assert.equal(convertToBase(100, 'GBP', rates), null, 'no rate → null, never a guess');
assert.equal(convertToBase(1.005, 'INR', rates), 1.01, 'rounds to 2dp');

// convertBetween goes via the base
assert.equal(convertBetween(100, 'USD', 'EUR', rates), round(100 * 84.5 / 91));
assert.equal(convertBetween(100, 'USD', 'USD', { }), 100, 'same currency needs no rate');
assert.equal(convertBetween(100, 'USD', 'GBP', rates), null);
function round(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// planReporting: single currency → as-is, no rate needed
{
  const p = planReporting(['USD', 'usd'], {});
  assert.equal(p.reportingCurrency, 'USD');
  assert.equal(p.converted, false);
  assert.equal(p.convert(12.345, 'USD'), 12.35);
  assert.deepEqual(p.unconverted, []);
}
// no data → base currency
assert.equal(planReporting([], {}).reportingCurrency, 'INR');
// mixed → base, converts what it can, names the rest
{
  const p = planReporting(['USD', 'EUR', 'GBP'], rates);
  assert.equal(p.reportingCurrency, 'INR');
  assert.equal(p.converted, true);
  assert.equal(p.convert(10, 'USD'), 845);
  assert.equal(p.convert(10, 'GBP'), null);
  assert.deepEqual(p.unconverted, ['GBP']);
}

// validateRateEntry
assert.equal(validateRateEntry('USD', 84.5), null);
assert.match(validateRateEntry('US', 84.5)!, /3-letter/);
assert.match(validateRateEntry('inr', 1)!, /base currency/);
assert.match(validateRateEntry('USD', 0)!, /above 0/);
assert.match(validateRateEntry('USD', -3)!, /above 0/);
assert.match(validateRateEntry('USD', NaN)!, /above 0/);

console.log('✓ fx: latest-wins rates, conversion, reporting plan, validation');
