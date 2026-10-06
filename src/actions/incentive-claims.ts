'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { estimateRodtep } from '@/lib/rodtep-estimate';
import { latestRates } from '@/lib/fx';
import { writeAudit } from '@/lib/audit';
import type { IncentiveType, IncentiveClaimStatus } from '@prisma/client';

export async function listIncentiveClaims() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'incentives:read')) throw new Error('You do not have permission to view this');
  return prisma.incentiveClaim.findMany({
    where: { tenantId },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getIncentiveClaim(id: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'incentives:read')) throw new Error('You do not have permission to view this');
  return prisma.incentiveClaim.findFirst({
    where: { id, tenantId },
    include: { order: { select: { id: true, orderNumber: true } } },
  });
}

export async function claimableIncentiveTotal() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'incentives:read')) throw new Error('You do not have permission to view this');
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
  if (!hasPermission(role, 'incentives:write')) throw new Error('You do not have permission to track incentive claims');
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
  if (!hasPermission(role, 'incentives:write')) throw new Error('You do not have permission to update incentive claims');

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

/**
 * Estimated RoDTEP entitlement for an order, from each line's value and the rate stored against its HS code.
 * The stored rate is an AI classification estimate and per-item caps are not applied, so this is a figure to
 * CHECK against the current notification — never a claimable amount. Nothing is saved.
 */
export async function estimateRodtepForOrder(orderId: string): Promise<{ amountInr: number | null; lines: { description: string; hsCode: string | null; amountInr: number | null; ratePct: number | null }[]; problems: string[] } | { unavailable: string }> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'incentives:read')) return { unavailable: 'You do not have access to incentives.' };
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId }, include: { lines: true, quote: { include: { lines: { include: { product: { include: { hsCode: true } } } } } } } });
  if (!order) return { unavailable: 'Order not found.' };
  const currency = order.currency ?? order.quote?.currency ?? 'USD';

  const rows = order.lines.length
    ? order.lines.map((l) => ({ description: l.description, hsCode: l.hsCode, value: l.lineTotal }))
    : (order.quote?.lines ?? []).map((l) => ({ description: l.description, hsCode: l.product?.hsCode?.hsCode ?? null, value: l.lineTotal }));
  if (rows.length === 0) return { unavailable: 'The order has no line items to value.' };

  const [codes, snaps] = await Promise.all([
    prisma.hsCode.findMany({ where: { tenantId, hsCode: { in: rows.map((r) => r.hsCode).filter((x): x is string => !!x) } }, select: { hsCode: true, rodtepRatePct: true } }),
    prisma.fxSnapshot.findMany({ where: { tenantId }, orderBy: { asOf: 'desc' }, take: 200 }),
  ]);
  const rates = latestRates(snaps);

  const problems = new Set<string>();
  let total = 0, any = false;
  const lines = rows.map((r) => {
    const rate = r.hsCode ? codes.find((c) => c.hsCode === r.hsCode)?.rodtepRatePct ?? null : null;
    if (!r.hsCode) problems.add('A line has no HS code, so no rate could be found for it.');
    const e = estimateRodtep({ fobValue: r.value, currency, ratePct: rate, rates, rateIsAiEstimate: true });
    e.problems.forEach((p) => problems.add(p));
    if (e.amountInr != null) { total += e.amountInr; any = true; }
    return { description: r.description, hsCode: r.hsCode, amountInr: e.amountInr, ratePct: rate };
  });
  problems.add('Order value is used as the FOB value — adjust if the invoice includes freight or insurance.');
  return { amountInr: any ? Math.round(total * 100) / 100 : null, lines, problems: [...problems] };
}
