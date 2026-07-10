'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { requireFeature } from '@/lib/billing/entitlements';
import { reviewLcTerms } from '@/lib/ai/lc-advisor';

export async function listLettersOfCredit(tenantId: string, orderId: string) {
  return prisma.letterOfCredit.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
}

function buildOrderContext(order: {
  orderNumber: string;
  product: string | null;
  quantity: number | null;
  unit: string | null;
  incoterm: string | null;
  destination: string | null;
  originPort: string | null;
  destPort: string | null;
}) {
  return [
    `Order number: ${order.orderNumber}`,
    `Product: ${order.product ?? 'unspecified'}`,
    `Quantity: ${order.quantity ?? 'unspecified'} ${order.unit ?? ''}`.trim(),
    `Incoterm: ${order.incoterm ?? 'unspecified'}`,
    `Origin port: ${order.originPort ?? 'unspecified'}`,
    `Destination port: ${order.destPort ?? 'unspecified'}`,
    `Final destination: ${order.destination ?? 'unspecified'}`,
  ].join('\n');
}

export async function reviewLetterOfCredit(input: {
  orderId: string;
  lcNumber?: string;
  issuingBank?: string;
  rawText: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to review LC terms');
  await requireFeature(tenantId, 'lc_advisor');
  if (!input.rawText.trim()) throw new Error('Paste the draft LC text first');

  const order = await prisma.order.findFirst({ where: { id: input.orderId, tenantId } });
  if (!order) throw new Error('Order not found');

  const { review, interactionId } = await reviewLcTerms(input.rawText, buildOrderContext(order), tenantId, userId);

  const lc = await prisma.letterOfCredit.create({
    data: {
      tenantId,
      orderId: input.orderId,
      lcNumber: input.lcNumber?.trim() || null,
      issuingBank: input.issuingBank?.trim() || null,
      rawText: input.rawText,
      workable: review.workable,
      reviewSummary: review.summary,
      issues: review.issues,
      reviewedAt: new Date(),
      createdByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: input.orderId,
    action: 'create',
    summary: `Reviewed LC for order ${order.orderNumber}: ${review.workable ? 'workable' : 'needs revision'} (${review.issues.length} issue(s))`,
    after: { workable: review.workable, issueCount: review.issues.length },
  });

  revalidatePath(`/dashboard/orders/${input.orderId}`);
  return { ...lc, interactionId };
}
