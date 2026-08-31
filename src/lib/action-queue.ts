import 'server-only';
import { prisma } from '@/lib/prisma';
import { writeDomainEvent } from '@/lib/domain-events';
import type { ActionKind, Prisma } from '@prisma/client';

/**
 * Action Queue producer side (CPO_PRODUCT_PLAN §3.10). Every department that surfaces an AI-proposed
 * action — a drafted buyer follow-up, an expense to review, a compliance renewal, a dunning nudge —
 * calls enqueueAction() instead of scattering bespoke notification surfaces. The queue is the single
 * approve/edit/reject inbox; nothing here runs an external effect (that waits for a human decision).
 */

/** Which department column the item files under in the queue UI. */
export type ActionDepartment = 'SELL' | 'MONEY' | 'SHIP' | 'COMPLY';

export interface EnqueueActionInput {
  tenantId: string;
  kind: ActionKind;
  department: ActionDepartment;
  title: string;
  summary: string;
  payload?: Prisma.InputJsonValue;
  confidence?: number;
  linkedType?: string;
  linkedId?: string;
  /** Idempotency key: while an item with this key is still pending, a re-run enqueues nothing new. */
  dedupeKey?: string;
  /** runAi draft this action approves, if any — consumed through the single-shot gate on approval. */
  aiInteractionId?: string;
  isDemo?: boolean;
}

/**
 * Enqueue a proposed action. Idempotent on `dedupeKey`: a cron retry that re-derives the same pending
 * action is a no-op, so the founder never sees the same nudge twice. Returns the item id, or the id of
 * the existing pending duplicate.
 */
export async function enqueueAction(input: EnqueueActionInput): Promise<string> {
  if (input.dedupeKey) {
    const existing = await prisma.actionQueueItem.findFirst({
      where: { tenantId: input.tenantId, dedupeKey: input.dedupeKey, status: 'pending' },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const item = await prisma.actionQueueItem.create({
    data: {
      tenantId: input.tenantId,
      kind: input.kind,
      department: input.department,
      title: input.title,
      summary: input.summary,
      payload: input.payload,
      confidence: input.confidence,
      linkedType: input.linkedType,
      linkedId: input.linkedId,
      dedupeKey: input.dedupeKey,
      aiInteractionId: input.aiInteractionId,
      isDemo: input.isDemo ?? false,
    },
  });

  await writeDomainEvent(prisma, {
    tenantId: input.tenantId,
    type: 'action.enqueued',
    refId: item.id,
    payload: { kind: input.kind, department: input.department },
  });

  return item.id;
}

export interface AcceptanceStat {
  kind: ActionKind;
  /** Decided items = approved + rejected (snoozed/pending are not yet a signal). */
  decided: number;
  approved: number;
  /** Approved without any edit to the AI's payload — the numerator of the promotion metric. */
  approvedUnedited: number;
  /** approvedUnedited / decided, or null when there is no decision history yet. */
  acceptanceRate: number | null;
  /** True once the §4 promotion bar is met: ≥60% unedited acceptance over ≥100 decisions. */
  promotionEligible: boolean;
}

export const PROMOTION_MIN_DECISIONS = 100;
export const PROMOTION_MIN_RATE = 0.6;

/** One row of the `groupBy(kind, status, editedOnApprove)` aggregate — the shape the pure reducer consumes. */
export interface AcceptanceGroupRow {
  kind: ActionKind;
  status: 'approved' | 'rejected';
  editedOnApprove: boolean;
  count: number;
}

/**
 * Pure reducer for the L-promotion currency (CPO_PRODUCT_PLAN §4): folds decision groups into per-kind
 * approve-without-edit stats. Kept DB-free so the promotion math is unit-testable. A kind is promotion-
 * eligible once unedited acceptance clears 60% over 100+ decisions (the §4 guardrail sign-off is a separate
 * human gate). Rejections count toward the denominator; snoozed/pending items are not yet a signal.
 */
export function computeAcceptanceStats(rows: AcceptanceGroupRow[]): AcceptanceStat[] {
  const byKind = new Map<ActionKind, { decided: number; approved: number; approvedUnedited: number }>();
  for (const r of rows) {
    const agg = byKind.get(r.kind) ?? { decided: 0, approved: 0, approvedUnedited: 0 };
    agg.decided += r.count;
    if (r.status === 'approved') {
      agg.approved += r.count;
      if (!r.editedOnApprove) agg.approvedUnedited += r.count;
    }
    byKind.set(r.kind, agg);
  }

  return [...byKind.entries()].map(([kind, agg]) => {
    const acceptanceRate = agg.decided > 0 ? agg.approvedUnedited / agg.decided : null;
    return {
      kind,
      decided: agg.decided,
      approved: agg.approved,
      approvedUnedited: agg.approvedUnedited,
      acceptanceRate,
      promotionEligible:
        agg.decided >= PROMOTION_MIN_DECISIONS && acceptanceRate !== null && acceptanceRate >= PROMOTION_MIN_RATE,
    };
  });
}

/**
 * Per-kind approve-without-edit rate for a tenant — the queryable half of the §4 promotion rule. Thin DB
 * shell over {@link computeAcceptanceStats}.
 */
export async function actionAcceptanceStats(tenantId: string): Promise<AcceptanceStat[]> {
  const rows = await prisma.actionQueueItem.groupBy({
    by: ['kind', 'status', 'editedOnApprove'],
    where: { tenantId, status: { in: ['approved', 'rejected'] } },
    _count: { _all: true },
  });

  return computeAcceptanceStats(
    rows.map((r) => ({
      kind: r.kind,
      status: r.status as 'approved' | 'rejected',
      editedOnApprove: r.editedOnApprove,
      count: r._count._all,
    })),
  );
}
