import assert from 'node:assert/strict';
import { hasPermission, ROLE_PERMISSIONS, ROLE_LABELS } from '../../lib/permissions';
import { slugify, isValidSlug, emailDomain, isFreeMailDomain, RESERVED_SLUGS } from '../../lib/slug';

/**
 * RBAC role→permission gates + tenant slug / email-domain rules.
 * Pure, no DB: `npm run test:access`.
 */

// ── hasPermission ─────────────────────────────────────────────────────────────
assert.equal(hasPermission(null, 'quotes:read'), false, 'no role → deny');
assert.equal(hasPermission(undefined, 'quotes:read'), false);
assert.equal(hasPermission('customer', 'quotes:read'), false, 'external roles have no staff perms');
assert.equal(hasPermission('vendor', 'quotes:read'), false);
assert.equal(hasPermission('viewer', 'quotes:read'), true);
assert.equal(hasPermission('viewer', 'quotes:write'), false, 'viewer is read-only');
assert.equal(hasPermission('sales', 'quotes:write'), true);
assert.equal(hasPermission('sales', 'invoices:write'), false, 'sales cannot write invoices');
assert.equal(hasPermission('finance', 'invoices:write'), true);

// Only owner/super_admin manage users/roles.
assert.equal(hasPermission('admin', 'users:manage'), false);
assert.equal(hasPermission('super_admin', 'users:manage'), true);
assert.equal(hasPermission('super_admin', 'roles:manage'), true);
assert.equal(hasPermission('owner', 'users:manage'), true);
assert.equal(hasPermission('owner', 'roles:manage'), true);

// admin has every staff permission except the two super_admin/owner-only ones.
{
  const adminPerms = new Set(ROLE_PERMISSIONS.admin);
  assert.ok(!adminPerms.has('users:manage'));
  assert.ok(ROLE_PERMISSIONS.super_admin.includes('users:manage'));
  assert.ok(ROLE_PERMISSIONS.owner.includes('users:manage'));
}

// EXPORT_OS_MASTER_PLAN §6.2 — owner gets everything; admin gets everything except
// billing, domains, org transfer/delete, and granting support access.
{
  const OWNER_ONLY = ['billing:manage', 'domains:manage', 'org:transfer', 'org:delete', 'support_access:grant'] as const;
  for (const perm of OWNER_ONLY) {
    assert.equal(hasPermission('owner', perm), true, `owner should have ${perm}`);
    assert.equal(hasPermission('admin', perm), false, `admin should not have ${perm}`);
  }
  // admin still gets the broader settings/branding/etc. surface an owner-only carve-out excludes.
  assert.equal(hasPermission('admin', 'settings:manage'), true);
  assert.equal(hasPermission('admin', 'branding:manage'), true);
}

// Expand step (§6.1): owner and super_admin are treated identically everywhere until the
// backfill runs and super_admin is dropped in a later contract step.
assert.deepEqual(
  new Set(ROLE_PERMISSIONS.owner),
  new Set(ROLE_PERMISSIONS.super_admin),
  'owner and super_admin must carry identical permission sets during the expand phase',
);

// ops_admin (ported from Anabyn, §6.2): full admin reach minus the expense ledger and P&L.
assert.equal(hasPermission('ops_admin', 'orders:write'), true);
assert.equal(hasPermission('ops_admin', 'settings:manage'), true);
assert.equal(hasPermission('ops_admin', 'expenses:read'), false, 'ops_admin excludes the expense ledger');
assert.equal(hasPermission('ops_admin', 'expenses:write'), false);
assert.equal(hasPermission('ops_admin', 'expenses:delete'), false);
assert.equal(hasPermission('ops_admin', 'reports:pnl'), false, 'ops_admin excludes P&L');
assert.equal(hasPermission('ops_admin', 'billing:manage'), false, 'ops_admin is not owner-tier');

// Every role has a human label.
for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
  assert.ok(ROLE_LABELS[role], `missing label for ${role}`);
}

// ── slugify ───────────────────────────────────────────────────────────────────
assert.equal(slugify('Acme Textiles Pvt. Ltd.'), 'acme-textiles-pvt-ltd');
assert.equal(slugify('  --Hello__World--  '), 'hello-world');
assert.equal(slugify('a'.repeat(60)).length, 40, 'truncated to 40');

// ── isValidSlug ───────────────────────────────────────────────────────────────
assert.equal(isValidSlug('acme'), true);
assert.equal(isValidSlug('ab'), false, 'too short (<3)');
assert.equal(isValidSlug('Acme'), false, 'uppercase rejected');
assert.equal(isValidSlug('bad slug'), false, 'space rejected');
for (const reserved of RESERVED_SLUGS) {
  assert.equal(isValidSlug(reserved), false, `${reserved} is reserved`);
}

// ── email domain helpers ──────────────────────────────────────────────────────
assert.equal(emailDomain('user@Example.COM'), 'example.com', 'lowercased');
assert.equal(emailDomain('no-at-sign'), null);
assert.equal(emailDomain(null), null);
assert.equal(emailDomain('a@b@c.com'), 'c.com', 'last @ wins');
assert.equal(isFreeMailDomain('gmail.com'), true);
assert.equal(isFreeMailDomain('acme.com'), false, 'corporate domain');
assert.equal(isFreeMailDomain(null), false);

console.log('✓ permissions + slug/email: RBAC gates, slug validation, free-mail detection');
