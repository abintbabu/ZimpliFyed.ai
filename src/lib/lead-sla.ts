import type { LeadStage } from '@prisma/client';

/**
 * Lead follow-up SLA. Pure and side-effect free so it can drive the lead board, the Today queue and
 * any digest.
 *
 * A lead is flagged when its owner-set follow-up date has arrived or passed, or — when no follow-up is
 * scheduled — when it has sat untouched longer than the window for its stage. Stages that are already
 * in fulfilment (or lost) carry no chase SLA.
 */

export type LeadSlaLevel = 'due' | 'overdue' | 'stale';

export type LeadSlaResult = {
  level: LeadSlaLevel;
  /** Whole days overdue (overdue) or untouched (stale); 0 when due today. */
  days: number;
  label: string;
} | null;

const NO_SLA_STAGES: ReadonlySet<LeadStage> = new Set(['In_Production', 'Shipped', 'Lost']);

/** Days without a touch before an open lead with no follow-up date is stale, by stage. */
export const STALE_AFTER_DAYS: Partial<Record<LeadStage, number>> = {
  New: 2,
  Insufficient_Info: 3,
  Follow_Up: 5,
};

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type SlaLead = {
  stage: LeadStage;
  nextFollowUpAt?: Date | null;
  createdAt?: Date | null;
  /** Any edit to the record counts as a touch. */
  updatedAt?: Date | null;
};

export function leadSla(lead: SlaLead, now: Date = new Date()): LeadSlaResult {
  if (NO_SLA_STAGES.has(lead.stage)) return null;

  // An explicit follow-up date is an owner-set commitment and takes priority.
  if (lead.nextFollowUpAt) {
    const overdueDays = Math.round((startOfDay(now).getTime() - startOfDay(lead.nextFollowUpAt).getTime()) / MS_PER_DAY);
    if (overdueDays > 0) return { level: 'overdue', days: overdueDays, label: `Follow-up ${overdueDays}d overdue` };
    if (overdueDays === 0) return { level: 'due', days: 0, label: 'Follow-up due today' };
    return null; // scheduled for the future — nothing to flag
  }

  const threshold = STALE_AFTER_DAYS[lead.stage];
  const lastTouch = lead.updatedAt ?? lead.createdAt;
  if (threshold == null || !lastTouch) return null;

  const idle = Math.floor((now.getTime() - lastTouch.getTime()) / MS_PER_DAY);
  if (idle >= threshold) return { level: 'stale', days: idle, label: `No activity ${idle}d` };
  return null;
}
