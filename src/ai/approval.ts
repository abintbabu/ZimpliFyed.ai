import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Human-approval gate (PRODUCT_PLAN §6): records that a specific authenticated user approved
 * an AI draft. Approval is single-shot — the atomic `approvedAt: null` guard means a draft
 * can only be approved/consumed once, so an already-used draft can't drive a second external
 * effect (e.g. re-sending an RFQ built from the same extraction).
 */
export async function approveAiInteraction(params: {
  interactionId: string;
  tenantId: string;
  userId: string;
  /** When true (external-effect gates), an already-approved interaction is an error. When false (feedback "accept"), it is a no-op. */
  requireUnused: boolean;
}): Promise<void> {
  const { count } = await prisma.aiInteraction.updateMany({
    where: { id: params.interactionId, tenantId: params.tenantId, approvedAt: null },
    data: { approvedByUserId: params.userId, approvedAt: new Date() },
  });
  if (count === 1) return;

  const existing = await prisma.aiInteraction.findFirst({
    where: { id: params.interactionId, tenantId: params.tenantId },
    select: { approvedAt: true },
  });
  if (!existing) throw new Error('AI interaction not found');
  if (params.requireUnused) throw new Error('This AI draft has already been approved and used');
}
