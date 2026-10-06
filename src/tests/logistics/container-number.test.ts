import assert from 'node:assert/strict';
import { normalizeContainerNumber, containerCheckDigit, checkContainerNumber } from '../../lib/container-number';

/** ISO 6346 (pure): run via `npm run test:loadability`. */

// Published worked example: CSQU3054383 (check digit 3)
assert.equal(containerCheckDigit('CSQU305438'), 3);
assert.deepEqual(checkContainerNumber('CSQU3054383'), { ok: true, number: 'CSQU3054383' });
// Other widely-cited valid numbers
for (const n of ['MSKU9070323', 'TEMU6879427', 'TCNU1234563']) {
  const c = checkContainerNumber(n);
  assert.equal(c.ok, containerCheckDigit(n.slice(0, 10)) === Number(n[10]), `${n} agrees with the algorithm`);
}
// Every wrong check digit for a valid prefix is rejected, exactly one is accepted
{
  const ok = Array.from({ length: 10 }, (_, d) => checkContainerNumber(`CSQU305438${d}`).ok).filter(Boolean).length;
  assert.equal(ok, 1, 'exactly one check digit is valid');
  assert.match((checkContainerNumber('CSQU3054380') as { reason: string }).reason, /should end in 3/);
}
// A single transposition is caught
assert.equal(checkContainerNumber('CSQU3054833').ok, false);
// Letter values skip multiples of 11 (so L = 23, not 22)
assert.equal(containerCheckDigit('AAAU000000') !== containerCheckDigit('LLLU000000'), true);
// A check value of 10 maps to 0
{
  let found = false;
  for (let i = 0; i < 1000 && !found; i++) { const p = `ABCU${String(i).padStart(6, '0')}`; if (containerCheckDigit(p) === 0) { assert.equal(checkContainerNumber(`${p}0`).ok, true); found = true; } }
  assert.ok(found);
}
// Normalisation and shape
assert.equal(normalizeContainerNumber('csqu 305438-3'), 'CSQU3054383');
assert.equal(normalizeContainerNumber('CSQX3054383'), null, 'fourth letter must be U, J or Z');
assert.equal(normalizeContainerNumber('CSQU305438'), null); assert.equal(normalizeContainerNumber('CSQU30543834'), null); assert.equal(normalizeContainerNumber(''), null); assert.equal(normalizeContainerNumber('1234567890A'), null);
assert.equal(checkContainerNumber('nonsense').ok, false);

console.log('✓ container-number: ISO 6346 check digit, normalisation');
