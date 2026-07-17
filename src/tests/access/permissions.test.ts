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

// Only super_admin manages users/roles.
assert.equal(hasPermission('admin', 'users:manage'), false);
assert.equal(hasPermission('super_admin', 'users:manage'), true);
assert.equal(hasPermission('super_admin', 'roles:manage'), true);

// admin has every staff permission except the two super_admin-only ones.
{
  const adminPerms = new Set(ROLE_PERMISSIONS.admin);
  assert.ok(!adminPerms.has('users:manage'));
  assert.ok(ROLE_PERMISSIONS.super_admin.includes('users:manage'));
}

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
