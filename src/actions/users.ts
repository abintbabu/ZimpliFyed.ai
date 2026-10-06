'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission, OWNER_ROLES } from '@/lib/permissions';
import { denyInvite, denyMemberRemoval, denyRoleChange, normaliseInviteEmail } from '@/lib/team-guards';
import { writeAudit } from '@/lib/audit';
import { checkRateLimitDb } from '@/lib/rate-limit-db';
import { hasSeatAvailable } from '@/lib/billing/entitlements';
import { sendInviteEmail } from '@/lib/invite-email';
import type { MembershipRole } from '@prisma/client';

const INVITE_LIMIT = 20;
const INVITE_WINDOW_MS = 60 * 60 * 1000;
const INVITE_TTL_DAYS = 14;

export async function listMembers() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'members:invite')) throw new Error('You do not have permission to view this');
  return prisma.membership.findMany({
    where: { tenantId },
    include: { user: { select: { name: true, email: true, image: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Assignee picker data, for any member who can see the task board.
 *
 * Separate from listMembers() on purpose: that one is the members-admin screen and is gated on
 * 'members:invite', which Sales and Finance don't hold — but they do need to assign tasks. This
 * returns only what the picker renders, rather than the full Membership row with its user record
 * (Next.js data-security guidance: return what the UI needs, not raw database records).
 *
 * It exposes `userId`, not the membership id. The task form previously passed `membership.id` as
 * `assigneeUserId`, so every task created from that form was assigned to an id that is not a user.
 */
export async function listAssignableMembers(): Promise<
  { userId: string; role: MembershipRole; name: string | null; email: string | null }[]
> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'tasks:read')) throw new Error('You do not have permission to view this');
  const rows = await prisma.membership.findMany({
    where: { tenantId },
    select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, email: m.user.email }));
}

export async function listPendingInvites() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'members:invite')) throw new Error('You do not have permission to view this');
  return prisma.invite.findMany({
    where: { tenantId, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * How many owners this tenant has. Used by the last-owner guard below: a workspace must never be
 * left with zero owners, because OWNER_ONLY covers billing, domains, org transfer and org delete —
 * losing the last owner is unrecoverable without platform-admin intervention.
 */
async function ownerCount(tenantId: string): Promise<number> {
  return prisma.membership.count({ where: { tenantId, role: { in: [...OWNER_ROLES] } } });
}

export async function inviteUser(email: string, role: MembershipRole) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole, userId } = session;
  const denied = denyInvite(callerRole, role);
  if (denied) throw new Error(denied);

  const normalised = normaliseInviteEmail(email);
  if (!normalised) throw new Error('Enter a valid email address');

  if (!(await hasSeatAvailable(tenantId))) {
    throw new Error('Seat limit reached — upgrade your plan to invite more teammates');
  }

  // DB-backed, so the limit holds across instances (the in-memory limiter reset per process).
  const rl = await checkRateLimitDb(`invite:${tenantId}`, INVITE_LIMIT, INVITE_WINDOW_MS);
  if (!rl.allowed) {
    throw new Error('Too many invites sent recently. Please try again later.');
  }

  // Every invite gets a token and an expiry: the token is what makes an emailable /join link
  // possible, and an invite that never expires is a standing credential for an address that may
  // since have changed hands.
  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  await prisma.invite.upsert({
    where: { tenantId_email: { tenantId, email: normalised } },
    create: { tenantId, email: normalised, role, invitedByUserId: userId, token, expiresAt },
    update: { role, acceptedAt: null, token, expiresAt },
  });

  await writeAudit({
    session,
    collection: 'invites',
    documentId: normalised,
    action: 'assign',
    summary: `Invited ${normalised} as ${role}`,
    after: { email: normalised, role, expiresAt: expiresAt.toISOString() },
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  // Non-fatal: the Invite row is committed and the link stays valid, so a mail outage must not
  // fail the action. The result is surfaced so the UI can offer the link to copy by hand.
  const delivery = await sendInviteEmail({
    to: normalised,
    token,
    role,
    tenantName: tenant?.name ?? 'your workspace',
    invitedByEmail: inviter?.email ?? 'A teammate',
  });

  revalidatePath('/dashboard/users');
  return { ok: true as const, emailed: delivery.sent, reason: delivery.reason };
}

export async function revokeInvite(inviteId: string) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole } = session;
  if (!hasPermission(callerRole, 'members:invite')) {
    throw new Error('You do not have permission to manage invites');
  }

  const invite = await prisma.invite.findFirst({ where: { id: inviteId, tenantId } });
  if (!invite) throw new Error('Invite not found');
  await prisma.invite.delete({ where: { id: inviteId, tenantId } });

  await writeAudit({
    session,
    collection: 'invites',
    documentId: inviteId,
    action: 'delete',
    summary: `Revoked invite for ${invite.email ?? 'link invite'}`,
    before: { email: invite.email, role: invite.role },
  });

  revalidatePath('/dashboard/users');
}

export async function updateMemberRole(membershipId: string, role: MembershipRole) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole } = session;
  const before = await prisma.membership.findFirst({ where: { id: membershipId, tenantId } });
  if (!before) throw new Error('Membership not found');
  if (before.role === role) return;

  // ownerCount is only needed when demoting an owner, but the guard is pure so it takes the count
  // either way — one indexed count on a members screen is not worth branching around.
  const denied = denyRoleChange(callerRole, before.role, role, await ownerCount(tenantId));
  if (denied) throw new Error(denied);

  await prisma.membership.update({ where: { id: membershipId, tenantId }, data: { role } });

  await writeAudit({
    session,
    collection: 'memberships',
    documentId: membershipId,
    action: 'role_change',
    summary: `Changed role: ${before.role} -> ${role}`,
    before: { role: before.role },
    after: { role },
  });

  revalidatePath('/dashboard/users');
}

/**
 * Offboard a teammate. Until this existed there was no way to revoke access at all — a departed
 * employee kept their membership (and so their role) permanently, which on its own disqualified
 * the product for team use.
 *
 * Access ends on the removed user's next request, not at token expiry, because
 * requireTenantSession() reads the Membership row from the database rather than trusting the
 * session JWT's cached claim.
 */
export async function removeMember(membershipId: string) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole, userId } = session;
  if (!hasPermission(callerRole, 'members:remove')) {
    throw new Error('You do not have permission to remove members');
  }

  const target = await prisma.membership.findFirst({
    where: { id: membershipId, tenantId },
    include: { user: { select: { email: true } } },
  });
  if (!target) throw new Error('Membership not found');

  const denied = denyMemberRemoval(callerRole, target.role, await ownerCount(tenantId));
  if (denied) throw new Error(denied);

  await prisma.membership.delete({ where: { id: membershipId, tenantId } });

  // Drop any pending invite for the same address, so the removal can't be undone by an
  // unconsumed invite still sitting in the table.
  if (target.user.email) {
    await prisma.invite.deleteMany({ where: { tenantId, email: target.user.email, acceptedAt: null } });
  }
  // If this was their last-active tenant, clear the pointer so /welcome re-resolves instead of
  // routing them at a workspace they can no longer enter.
  await prisma.user.updateMany({
    where: { id: target.userId, lastActiveTenantId: tenantId },
    data: { lastActiveTenantId: null },
  });

  await writeAudit({
    session,
    collection: 'memberships',
    documentId: membershipId,
    action: 'delete',
    summary:
      target.userId === userId
        ? `Left the workspace (${target.role})`
        : `Removed ${target.user.email ?? target.userId} (${target.role})`,
    before: { userId: target.userId, email: target.user.email, role: target.role },
  });

  revalidatePath('/dashboard/users');
}
