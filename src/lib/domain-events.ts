import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type DomainEventType =
  | 'order.created'
  | 'quote.sent'
  | 'invoice.paid'
  | 'docset.generated'
  | 'milestone.reached'
  | 'billing.subscribed'
  | 'billing.cancelled'
  | 'billing.payment_failed'
  | 'billing.payment_recovered'
  | 'billing.trial_expired'
  | 'billing.suspended'
  | 'billing.pending_deletion'
  | 'billing.deleted'
  | 'billing.dunning_nudge'
  | 'data_export.requested'
  | 'compliance.expiry_alert';

/** Minimal event log for key mutations (AI_PLATFORM_SPEC §6). Consumers — onboarding checklist, health score,
 * future webhooks/agents — poll this table; no queue infra until the TEAMS_AND_ORG_PLAN §9 checkpoint. */
export async function writeDomainEvent(
  tx: Prisma.TransactionClient | typeof prisma,
  input: { tenantId: string; type: DomainEventType; refId?: string; payload?: Prisma.InputJsonValue },
) {
  await tx.domainEvent.create({
    data: { tenantId: input.tenantId, type: input.type, refId: input.refId, payload: input.payload },
  });
}
