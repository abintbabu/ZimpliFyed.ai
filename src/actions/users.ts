'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rate-limit';
import type { MembershipRole } from '@prisma/client';

const INVITE_LIMIT = 20;
const INVITE_WINDOW_MS = 60 * 60 * 1000;

export async function listMembers(tenantId: string) {
  return prisma.membership.findMany({
    where: { tenantId },
    include: { user: { select: { name: true, email: true, image: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listPendingInvites(tenantId: string) {
  return prisma.invite.findMany({
    where: { tenantId, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function inviteUser(email: string, role: MembershipRole) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole, userId } = session;
  if (!hasPermission(callerRole, 'users:manage')) {
    throw new Error('You do not have permission to invite users');
  }

  if (!checkRateLimit(`invite:${tenantId}`, INVITE_LIMIT, INVITE_WINDOW_MS)) {
    throw new Error('Too many invites sent recently. Please try again later.');
  }

  await prisma.invite.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, role, invitedByUserId: userId },
    update: { role, acceptedAt: null },
  });

  await writeAudit({
    session,
    collection: 'invites',
    documentId: email,
    action: 'assign',
    summary: `Invited ${email} as ${role}`,
    after: { email, role },
  });

  revalidatePath('/dashboard/users');
}

export async function revokeInvite(inviteId: string) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole } = session;
  if (!hasPermission(callerRole, 'users:manage')) {
    throw new Error('You do not have permission to manage users');
  }

  const invite = await prisma.invite.delete({ where: { id: inviteId, tenantId } });

  await writeAudit({
    session,
    collection: 'invites',
    documentId: inviteId,
    action: 'delete',
    summary: `Revoked invite for ${invite.email}`,
    before: { email: invite.email, role: invite.role },
  });

  revalidatePath('/dashboard/users');
}

export async function updateMemberRole(membershipId: string, role: MembershipRole) {
  const session = await requireTenantSession();
  const { tenantId, role: callerRole } = session;
  if (!hasPermission(callerRole, 'roles:manage')) {
    throw new Error('You do not have permission to change roles');
  }

  const before = await prisma.membership.findFirst({ where: { id: membershipId, tenantId } });
  if (!before) throw new Error('Membership not found');

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
