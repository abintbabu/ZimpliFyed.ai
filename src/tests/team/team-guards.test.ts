import assert from 'node:assert/strict';
import {
  denyInvite,
  denyMemberRemoval,
  denyRoleAssignment,
  denyRoleChange,
  normaliseInviteEmail,
  canRedeemInvite,
  isInviteUsable,
} from '../../lib/team-guards';
import { ASSIGNABLE_ROLES, ROLE_PERMISSIONS, isOwnerRole } from '../../lib/permissions';
import type { MembershipRole } from '@prisma/client';

/**
 * Team-safety guards. Pure, no DB: `npm run test:team`.
 *
 * These cover the rules that decide whether a workspace can be taken over by a teammate who
 * shouldn't be able to, or stranded with nobody able to administer it. Each block names the gap it
 * closes, because every one of them was reachable before:
 *
 *  - no member removal existed at all, so a departed employee kept their access permanently;
 *  - nothing stopped the only owner being demoted, which loses billing/domains/org-transfer for
 *    good (there is no org:transfer implementation to recover with);
 *  - the members screen offered every role, including the two zero-permission portal identities;
 *  - 'members:invite'/'members:remove'/'roles:assign' had zero enforcement sites — every
 *    privileged call checked the legacy owner-only 'users:manage' instead.
 */

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as MembershipRole[];
const MANY_OWNERS = 3;
const LAST_OWNER = 1;

// ── Who may assign which role ────────────────────────────────────────────────
{
  // Staff roles can't hand out roles at all.
  for (const caller of ['viewer', 'sales', 'finance', 'production', 'logistics', 'marketing', 'procurement'] as const) {
    assert.ok(denyRoleAssignment(caller, 'viewer'), `${caller} must not assign roles`);
  }
  // Admin and ops_admin manage the team…
  assert.equal(denyRoleAssignment('admin', 'sales'), null);
  assert.equal(denyRoleAssignment('ops_admin', 'viewer'), null);
  assert.equal(denyRoleAssignment('owner', 'admin'), null);

  // …but only an owner can mint another owner. Otherwise 'members:invite' is an escalation path
  // straight to OWNER_ONLY (billing, domains, org transfer, org delete).
  assert.match(String(denyRoleAssignment('admin', 'owner')), /only an owner/i);
  assert.match(String(denyRoleAssignment('ops_admin', 'owner')), /only an owner/i);
  assert.equal(denyRoleAssignment('owner', 'owner'), null, 'an owner may appoint a co-owner');
  assert.equal(denyRoleAssignment('super_admin', 'owner'), null, 'legacy owner alias is owner-tier');

  // Non-assignable targets are refused for every caller, owners included.
  for (const target of ['customer', 'vendor', 'super_admin'] as const) {
    for (const caller of ['owner', 'admin', 'ops_admin'] as const) {
      assert.ok(denyRoleAssignment(caller, target), `${caller} must not assign ${target}`);
    }
  }
}

// ── Role changes and the last-owner guard ────────────────────────────────────
{
  assert.equal(denyRoleChange('owner', 'sales', 'finance', MANY_OWNERS), null, 'ordinary re-role');
  assert.equal(denyRoleChange('admin', 'sales', 'viewer', MANY_OWNERS), null, 'admins re-role staff');

  // The guard that makes a workspace recoverable.
  assert.match(
    String(denyRoleChange('owner', 'owner', 'viewer', LAST_OWNER)),
    /only owner/i,
    'demoting the last owner must be refused',
  );
  assert.equal(
    denyRoleChange('owner', 'owner', 'viewer', MANY_OWNERS),
    null,
    'demoting an owner is fine while another remains',
  );
  // Zero owners (a tenant already stranded) must not be a loophole that lets the state persist.
  assert.ok(denyRoleChange('owner', 'owner', 'viewer', 0), 'ownerCount 0 is still refused');

  // Promotion to owner never trips the last-owner guard.
  assert.equal(denyRoleChange('owner', 'viewer', 'owner', LAST_OWNER), null);

  // An admin cannot re-role an owner at all — demotion is a removal of owner-tier access.
  assert.match(String(denyRoleChange('admin', 'owner', 'viewer', MANY_OWNERS)), /only an owner/i);

  // super_admin counts as owner-tier on both sides of the comparison, so swapping between the two
  // owner roles is not a demotion and must not be blocked by the last-owner guard.
  assert.equal(denyRoleChange('owner', 'super_admin', 'owner', LAST_OWNER), null);
}

// ── Member removal ───────────────────────────────────────────────────────────
{
  assert.equal(denyMemberRemoval('owner', 'sales', MANY_OWNERS), null);
  assert.equal(denyMemberRemoval('admin', 'viewer', MANY_OWNERS), null);
  assert.equal(denyMemberRemoval('ops_admin', 'finance', MANY_OWNERS), null);

  // Staff can't offboard anyone.
  for (const caller of ['viewer', 'sales', 'finance'] as const) {
    assert.ok(denyMemberRemoval(caller, 'viewer', MANY_OWNERS), `${caller} must not remove members`);
  }

  // Same owner boundaries as re-roling.
  assert.match(String(denyMemberRemoval('admin', 'owner', MANY_OWNERS)), /only an owner/i);
  assert.match(String(denyMemberRemoval('owner', 'owner', LAST_OWNER)), /only owner/i);
  assert.equal(denyMemberRemoval('owner', 'owner', MANY_OWNERS), null);
  // Self-removal by a non-last owner is allowed — that's "leave workspace".
  assert.equal(denyMemberRemoval('owner', 'owner', 2), null);
}

// ── Invites ──────────────────────────────────────────────────────────────────
{
  assert.equal(denyInvite('owner', 'sales'), null);
  assert.equal(denyInvite('admin', 'finance'), null);
  assert.ok(denyInvite('sales', 'viewer'), 'sales cannot invite');
  assert.ok(denyInvite('viewer', 'viewer'), 'viewer cannot invite');
  assert.match(String(denyInvite('admin', 'owner')), /only an owner/i);
  assert.ok(denyInvite('owner', 'customer'), 'portal identities are not invitable team roles');

  // Every role the UI offers must actually be invitable by an owner — otherwise the dropdown
  // contains choices that always fail.
  for (const role of ASSIGNABLE_ROLES) {
    assert.equal(denyInvite('owner', role), null, `owner should be able to invite ${role}`);
  }
}

// ── Email normalisation ──────────────────────────────────────────────────────
{
  assert.equal(normaliseInviteEmail('  Priya@Acme.CO.IN '), 'priya@acme.co.in', 'trimmed + lowercased');
  assert.equal(normaliseInviteEmail('no-at-sign'), null);
  assert.equal(normaliseInviteEmail('two@@acme.com'), null);
  assert.equal(normaliseInviteEmail('nodomain@acme'), null, 'needs a dotted domain');
  assert.equal(normaliseInviteEmail('a b@acme.com'), null, 'no whitespace');
  assert.equal(normaliseInviteEmail(''), null);
  // Normalisation must be idempotent, or the (tenantId,email) unique key can be defeated by case.
  const once = normaliseInviteEmail('Mixed@Case.com');
  assert.equal(normaliseInviteEmail(once!), once);
}

// ── Invite redemption binding ────────────────────────────────────────────────
// Email invites gained tokens so they could be mailed as a /join link. Without this binding, a
// forwarded link would let anyone redeem an invite addressed to someone else.
{
  assert.equal(canRedeemInvite('cfo@acme.com', 'cfo@acme.com'), true);
  assert.equal(canRedeemInvite('cfo@acme.com', 'CFO@Acme.com'), true, 'case-insensitive match');
  assert.equal(canRedeemInvite('cfo@acme.com', 'intern@acme.com'), false, 'forwarded-link hijack refused');
  assert.equal(canRedeemInvite('cfo@acme.com', null), false, 'no email on the account → refused');
  // Open link invites are bearer tokens by design.
  assert.equal(canRedeemInvite(null, 'anyone@example.com'), true);
  assert.equal(canRedeemInvite(null, null), true);
}

// ── Invite liveness ──────────────────────────────────────────────────────────
{
  const now = new Date('2026-10-05T00:00:00Z');
  const live = { expiresAt: new Date('2026-10-19T00:00:00Z'), maxUses: null, useCount: 0 };
  assert.equal(isInviteUsable(live, now), true);
  assert.equal(isInviteUsable({ ...live, expiresAt: new Date('2026-10-04T23:59:59Z') }, now), false, 'expired');
  assert.equal(isInviteUsable({ expiresAt: null, maxUses: null, useCount: 99 }, now), true, 'no limits set');
  assert.equal(isInviteUsable({ expiresAt: null, maxUses: 3, useCount: 2 }, now), true, 'uses remaining');
  assert.equal(isInviteUsable({ expiresAt: null, maxUses: 3, useCount: 3 }, now), false, 'uses exhausted');
  assert.equal(isInviteUsable({ expiresAt: null, maxUses: 3, useCount: 4 }, now), false, 'over the limit');
  assert.equal(isInviteUsable({ expiresAt: null, maxUses: 0, useCount: 0 }, now), false, 'maxUses 0 is not unlimited');
}

// ── Invariants across the whole role table ───────────────────────────────────
{
  for (const caller of ALL_ROLES) {
    for (const target of ALL_ROLES) {
      // A non-owner can never produce an owner, by any path.
      if (isOwnerRole(target) && !isOwnerRole(caller)) {
        assert.ok(denyRoleAssignment(caller, target), `${caller} must not assign ${target}`);
        assert.ok(denyInvite(caller, target), `${caller} must not invite ${target}`);
        assert.ok(denyRoleChange(caller, 'viewer', target, MANY_OWNERS), `${caller} must not promote to ${target}`);
      }
      // The last owner can never be demoted or removed, whoever asks.
      if (isOwnerRole(target)) {
        assert.ok(
          denyRoleChange(caller, target, 'viewer', LAST_OWNER),
          `${caller} must not demote the last owner`,
        );
        assert.ok(
          denyMemberRemoval(caller, target, LAST_OWNER),
          `${caller} must not remove the last owner`,
        );
      }
    }
  }
}

console.log('✓ team-guards: role assignment, last-owner guard, removal, invite binding + liveness');
