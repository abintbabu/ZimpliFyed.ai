import assert from 'node:assert/strict';
import { generateMasterKey, seal, open } from '../../lib/crypto/vault';

/**
 * Credential-vault round-trip + tamper-detection test (DEV_PLAN_100 Sprint 1).
 * Pure crypto — no DB. Run with: npx tsx src/tests/security/vault.test.ts
 */

process.env.CRED_VAULT_MASTER_KEY ??= generateMasterKey();

function run() {
  // 1. Round-trip: what goes in comes back out.
  const secret = JSON.stringify({ access_token: 'ya29.a0-example', refresh_token: 'r-example', expiry: 1789000000 });
  const sealed = seal(secret);
  assert.equal(open(sealed), secret, 'round-trip must return the original secret');

  // 2. Ciphertext must not contain the plaintext.
  assert.ok(!sealed.ciphertext.includes('ya29'), 'ciphertext must not leak plaintext');

  // 3. Each seal uses a fresh data key + IV — identical plaintext yields different ciphertext.
  const a = seal('same');
  const b = seal('same');
  assert.notEqual(a.ciphertext, b.ciphertext, 'identical plaintext must not produce identical ciphertext');

  // 4. Tampering with the ciphertext must fail the GCM auth check, not return garbage.
  const tampered = { ...sealed, ciphertext: flipMiddleBase64Char(sealed.ciphertext) };
  assert.throws(() => open(tampered), 'tampered ciphertext must throw, not decrypt');

  // 5. A wrong master key must not decrypt.
  const priorKey = process.env.CRED_VAULT_MASTER_KEY;
  process.env.CRED_VAULT_MASTER_KEY = generateMasterKey();
  assert.throws(() => open(sealed), 'a different master key must not decrypt');
  process.env.CRED_VAULT_MASTER_KEY = priorKey;

  console.log('✓ vault: round-trip, non-leak, nonce-uniqueness, tamper-detection, key-isolation all pass');
}

function flipMiddleBase64Char(s: string): string {
  const i = Math.floor(s.length / 2);
  const swap = s[i] === 'A' ? 'B' : 'A';
  return s.slice(0, i) + swap + s.slice(i + 1);
}

run();
