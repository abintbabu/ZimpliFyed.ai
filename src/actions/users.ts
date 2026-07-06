'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import type { MembershipRole } from '@prisma/client';

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
  const { tenantId, role: callerRole, userId } = await requireTenantSession();
  if (!hasPermission(callerRole, 'users:manage')) {
    throw new Error('You do not have permission to invite users');
  }

  await prisma.invite.upsert({
    where: { tenantId_email: { tenantId, email } },
    create: { tenantId, email, role, invitedByUserId: userId },
    update: { role, acceptedAt: null },
  });

  revalidatePath('/dashboard/users');
}

export async function revokeInvite(inviteId: string) {
  const { tenantId, role: callerRole } = await requireTenantSession();
  if (!hasPermission(callerRole, 'users:manage')) {
    throw new Error('You do not have permission to manage users');
  }

  await prisma.invite.delete({ where: { id: inviteId, tenantId } });
  revalidatePath('/dashboard/users');
}
