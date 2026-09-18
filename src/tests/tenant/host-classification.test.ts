import assert from 'node:assert/strict';
import { classifyHost, DEV_TENANT_SLUG, type HostResolution } from '../../lib/tenant-resolver';

/**
 * Host classification table (EXPORT_OS_MASTER_PLAN §13.1 "Host classification" row): ~30 hosts to
 * their expected resolution, including adversarial suffix-attack hosts, empty/port-only input,
 * punycode, and case-folding. Pure, no DB: `npx tsx src/tests/tenant/host-classification.test.ts`.
 *
 * classifyHost must NEVER resolve an unrecognised host to a real tenant slug without
 * ALLOW_DEV_TENANT_FALLBACK=1 explicitly set — that is the entire point of this file existing
 * (EXPORT_OS_MASTER_PLAN §4.1, §17 launch blocker #1).
 */

delete process.env.ALLOW_DEV_TENANT_FALLBACK;

const CASES: [string | null | undefined, HostResolution][] = [
  // ── no context / malformed ──────────────────────────────────────────────
  [null, { kind: 'unknown', hostname: '' }],
  [undefined, { kind: 'unknown', hostname: '' }],
  ['', { kind: 'unknown', hostname: '' }],
  [':3000', { kind: 'unknown', hostname: ':3000' }],

  // ── local dev, no fallback flag set ─────────────────────────────────────
  ['localhost', { kind: 'unknown', hostname: 'localhost' }],
  ['localhost:3000', { kind: 'unknown', hostname: 'localhost' }],
  ['127.0.0.1', { kind: 'unknown', hostname: '127.0.0.1' }],
  ['127.0.0.1:3000', { kind: 'unknown', hostname: '127.0.0.1' }],
  ['acme.localhost', { kind: 'unknown', hostname: 'acme.localhost' }],
  ['acme.localhost:3000', { kind: 'unknown', hostname: 'acme.localhost' }],

  // ── platform surfaces ────────────────────────────────────────────────────
  ['zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],
  ['www.zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],
  ['WWW.ZIMPLIFYED.AI', { kind: 'platform', surface: 'marketing' }],
  ['app.zimplifyed.ai', { kind: 'platform', surface: 'app' }],
  ['admin.zimplifyed.ai', { kind: 'platform', surface: 'admin' }],
  ['api.zimplifyed.ai', { kind: 'platform', surface: 'api' }],
  ['API.ZIMPLIFYED.AI', { kind: 'platform', surface: 'api' }],
  ['mail.zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],
  ['static.zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],
  ['cdn.zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],
  ['status.zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],
  ['track.zimplifyed.ai', { kind: 'platform', surface: 'marketing' }],

  // ── real tenant subdomains ───────────────────────────────────────────────
  ['acme.zimplifyed.ai', { kind: 'subdomain', slug: 'acme' }],
  ['ACME.ZIMPLIFYED.AI', { kind: 'subdomain', slug: 'acme' }],
  ['acme-textiles.zimplifyed.ai', { kind: 'subdomain', slug: 'acme-textiles' }],
  ['acme.zimplifyed.ai:443', { kind: 'subdomain', slug: 'acme' }],
  // Unicode label — the WHATWG URL parser punycode-encodes it before classifyHost ever sees it.
  ['münchen.zimplifyed.ai', { kind: 'subdomain', slug: 'xn--mnchen-3ya' }],
  ['xn--mnchen-3ya.zimplifyed.ai', { kind: 'subdomain', slug: 'xn--mnchen-3ya' }],

  // ── adversarial: suffix/prefix attacks that must NOT resolve as our subdomain ───────────────────
  ['evil.com', { kind: 'custom', hostname: 'evil.com' }],
  ['demo.zimplifyed.ai.evil.com', { kind: 'custom', hostname: 'demo.zimplifyed.ai.evil.com' }],
  ['zimplifyed.ai.evil.com', { kind: 'custom', hostname: 'zimplifyed.ai.evil.com' }],
  ['notzimplifyed.ai', { kind: 'custom', hostname: 'notzimplifyed.ai' }],
  ['sub.evil.com', { kind: 'custom', hostname: 'sub.evil.com' }],

  // ── Wave-8 custom-domain candidates (unverified today — always `custom`, never a tenant grant) ──
  ['erp.acme-textiles.com', { kind: 'custom', hostname: 'erp.acme-textiles.com' }],
];

for (const [host, expected] of CASES) {
  const actual = classifyHost(host);
  assert.deepEqual(actual, expected, `classifyHost(${JSON.stringify(host)}) — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}

// ── ALLOW_DEV_TENANT_FALLBACK=1: unknown/localhost fall back to DEV_TENANT_SLUG; custom/adversarial
// hosts do NOT — `custom` is a distinct, meaningful state, never a dev convenience. ──
process.env.ALLOW_DEV_TENANT_FALLBACK = '1';
try {
  assert.deepEqual(classifyHost(null), { kind: 'dev', slug: DEV_TENANT_SLUG });
  assert.deepEqual(classifyHost(''), { kind: 'dev', slug: DEV_TENANT_SLUG });
  assert.deepEqual(classifyHost('localhost'), { kind: 'dev', slug: DEV_TENANT_SLUG });
  assert.deepEqual(classifyHost('localhost:3000'), { kind: 'dev', slug: DEV_TENANT_SLUG });
  assert.deepEqual(classifyHost('evil.com'), { kind: 'custom', hostname: 'evil.com' });
  assert.deepEqual(classifyHost('demo.zimplifyed.ai.evil.com'), { kind: 'custom', hostname: 'demo.zimplifyed.ai.evil.com' });
  assert.deepEqual(classifyHost('acme.zimplifyed.ai'), { kind: 'subdomain', slug: 'acme' }, 'a real subdomain match still wins over dev fallback');
} finally {
  delete process.env.ALLOW_DEV_TENANT_FALLBACK;
}

console.log(`✓ host-classification: ${CASES.length} static case(s) + dev-fallback behavior, all resolve as expected`);
