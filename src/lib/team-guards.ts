import { hasPermission, isAssignableRole, isOwnerRole } from './permissions';
import type { MembershipRole } from '@prisma/client';

/**
 * The team-membership decisions, as pure functions.
 *
 * They live apart from src/actions/users.ts for two reasons. First, there are two invite surfaces
 * (the members screen and the onboarding wizard's bulk/link invites) and they previously drifted —
 * one had a seat gate, the other didn't; one checked an owner-only permission, the other a
 * different one. Second, these are the rules that decide whether a workspace can be taken over or
 * stranded, and a rule that needs a database and a request context to test is a rule that doesn't
 * get tested.
 *
 * Each returns `null` when the action is allowed, or the reason it isn't. Callers surface the
 * reason verbatim — these strings are user-facing.
 */
export type Denial = string | null;

/** Can `callerRole` grant `targetRole` to someone (on invite or on re-role)? */
export function denyRoleAssignment(callerRole: MembershipRole, targetRole: MembershipRole): Denial {
  if (!hasPermission(callerRole, 'roles:assign') && !hasPermission(callerRole, 'members:invite')) {
    return 'You do not have permission to assign roles';
  }
  // `customer`/`vendor` are external portal identities with no staff permissions — assigning one
  // to a teammate silently locks them out of the dashboard. `super_admin` is the legacy owner
  // alias being retired.
  if (!isAssignableRole(targetRole)) return `${targetRole} cannot be assigned to a teammate`;
  // Without this, 'members:invite' (which Admins hold) would be an escalation path straight to
  // OWNER_ONLY: billing, domains, org transfer, org delete.
  if (isOwnerRole(targetRole) && !isOwnerRole(callerRole)) {
    return 'Only an owner can grant the owner role';
  }
  return null;
}

/**
 * Can `callerRole` change a member from `fromRole` to `toRole`?
 * `ownerCount` is the tenant's current number of owner-tier memberships.
 */
export function denyRoleChange(
  callerRole: MembershipRole,
  fromRole: MembershipRole,
  toRole: MembershipRole,
  ownerCount: number,
): Denial {
  if (!hasPermission(callerRole, 'roles:assign')) {
    return 'You do not have permission to change roles';
  }
  const assignment = denyRoleAssignment(callerRole, toRole);
  if (assignment) return assignment;
  // Demoting an owner is also a removal of owner-tier access, so it needs the same authority.
  if (isOwnerRole(fromRole) && !isOwnerRole(callerRole)) {
    return 'Only an owner can change another owner’s role';
  }
  // The last-owner guard. Losing every owner strands the workspace: nobody can reach billing,
  // domains, or org transfer, and recovery needs platform-admin intervention.
  if (isOwnerRole(fromRole) && !isOwnerRole(toRole) && ownerCount <= 1) {
    return 'This is the only owner. Make someone else an owner first.';
  }
  return null;
}

/** Can `callerRole` remove a member holding `targetRole`? */
export function denyMemberRemoval(
  callerRole: MembershipRole,
  targetRole: MembershipRole,
  ownerCount: number,
): Denial {
  if (!hasPermission(callerRole, 'members:remove')) {
    return 'You do not have permission to remove members';
  }
  if (isOwnerRole(targetRole) && !isOwnerRole(callerRole)) {
    return 'Only an owner can remove another owner';
  }
  if (isOwnerRole(targetRole) && ownerCount <= 1) {
    return 'This is the only owner. Make someone else an owner first.';
  }
  return null;
}

/** Can `callerRole` invite `targetRole` at all (permission + role-assignment rules)? */
export function denyInvite(callerRole: MembershipRole, targetRole: MembershipRole): Denial {
  if (!hasPermission(callerRole, 'members:invite')) {
    return 'You do not have permission to invite users';
  }
  return denyRoleAssignment(callerRole, targetRole);
}

/** Normalises and validates an invited address. Returns the normalised form, or null if invalid. */
export function normaliseInviteEmail(email: string): string | null {
  const normalised = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised) ? normalised : null;
}

/**
 * Whether a token-resolved invite may be redeemed by the authenticated account.
 *
 * Open link invites (`inviteEmail === null`) are bearer tokens by design. An invite addressed to a
 * specific person is not: once email invites started carrying tokens so they could be mailed as a
 * /join link, redeeming one from any account would have quietly defeated the targeting — a link
 * meant for the CFO accepted by whoever the forwarded mail reached.
 */
export function canRedeemInvite(inviteEmail: string | null, authedEmail: string | null): boolean {
  if (!inviteEmail) return true;
  return !!authedEmail && inviteEmail.toLowerCase() === authedEmail.toLowerCase();
}

/** Whether a token-resolved invite is still live (not expired, not used up). */
export function isInviteUsable(
  invite: { expiresAt: Date | null; maxUses: number | null; useCount: number },
  now: Date = new Date(),
): boolean {
  if (invite.expiresAt && invite.expiresAt < now) return false;
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return false;
  return true;
}
