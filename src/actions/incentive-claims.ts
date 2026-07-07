'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { IncentiveType, IncentiveClaimStatus } from '@prisma/client';

export async function listIncentiveClaims(tenantId: string) {
  return prisma.incentiveClaim.findMany({
    where: { tenantId },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function claimableIncentiveTotal(tenantId: string) {
  const result = await prisma.incentiveClaim.aggregate({
    where: { tenantId, status: 'claimable' },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

export async function createIncentiveClaim(input: {
  orderId: string;
  type: IncentiveType;
  amount: number;
  currency?: string;
  notes?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to track incentive claims');
  if (input.amount <= 0) throw new Error('Amount must be greater than zero');

  const order = await prisma.order.findFirst({ where: { id: input.orderId, tenantId } });
  if (!order) throw new Error('Order not found');

  const claim = await prisma.incentiveClaim.create({
    data: {
      tenantId,
      orderId: input.orderId,
      type: input.type,
      amount: input.amount,
      currency: input.currency || 'INR',
      notes: input.notes?.trim() || null,
    },
  });

  await writeAudit({
    session,
    collection: 'incentive_claims',
    documentId: claim.id,
    action: 'create',
    summary: `Tracked ${input.type} claim of ${claim.currency} ${claim.amount} for order ${order.orderNumber}`,
    after: { type: input.type, amount: input.amount },
  });

  revalidatePath('/dashboard/incentives');
  return claim;
}

export async function updateIncentiveClaimStatus(id: string, status: IncentiveClaimStatus) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'invoices:write')) throw new Error('You do not have permission to update incentive claims');

  const before = await prisma.incentiveClaim.findFirst({ where: { id, tenantId } });
  if (!before) throw new Error('Incentive claim not found');

  const now = new Date();
  const claim = await prisma.incentiveClaim.update({
    where: { id, tenantId },
    data: {
      status,
      claimedAt: status === 'claimed' ? now : before.claimedAt,
      receivedAt: status === 'received' ? now : before.receivedAt,
    },
  });

  await writeAudit({
    session,
    collection: 'incentive_claims',
    documentId: id,
    action: 'status_change',
    summary: `Incentive claim status: ${before.status} -> ${status}`,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath('/dashboard/incentives');
  return claim;
}
