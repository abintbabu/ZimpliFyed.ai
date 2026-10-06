// Follow-up cadences (V2). Pure — no DB, no clock. A cadence is an ordered list of "N days after the
// anchor, do X". This decides WHICH step is due; what happens then (draft a follow-up, queue it for approval)
// stays in the action queue at L1 — promotion to automatic sending is gated by approve-without-edit rates and
// is not switched on here.

export type CadenceKind = 'nudge' | 'requote' | 'reactivate';

export type CadenceStep = { afterDays: number; kind: CadenceKind };

/** Day-3 nudge, day-7 re-quote, quarterly reactivation (ROADMAP §2.2). */
export const DEFAULT_CADENCE: CadenceStep[] = [
  { afterDays: 3, kind: 'nudge' },
  { afterDays: 7, kind: 'requote' },
  { afterDays: 90, kind: 'reactivate' },
];

const KINDS: CadenceKind[] = ['nudge', 'requote', 'reactivate'];
const DAY = 86_400_000;

/** Parses a tenant-supplied cadence, dropping malformed steps; falls back to the default when nothing usable. */
export function parseCadence(raw: unknown): CadenceStep[] {
  if (!Array.isArray(raw)) return DEFAULT_CADENCE;
  const steps = raw
    .filter((s): s is { afterDays: unknown; kind: unknown } => typeof s === 'object' && s !== null)
    .map((s) => ({ afterDays: Number(s.afterDays), kind: s.kind as CadenceKind }))
    .filter((s) => Number.isFinite(s.afterDays) && s.afterDays > 0 && s.afterDays <= 730 && KINDS.includes(s.kind))
    .sort((a, b) => a.afterDays - b.afterDays);
  const dedup = steps.filter((s, i) => i === 0 || s.afterDays !== steps[i - 1].afterDays);
  return dedup.length ? dedup : DEFAULT_CADENCE;
}

export type DueStep = { index: number; step: CadenceStep; dueAt: Date; overdueDays: number };

/**
 * The next step that is due, given how many have already been handled. Only ONE step is returned at a time —
 * a lead that went quiet for a month does not get a burst of catch-up messages — and it is always the earliest
 * unhandled one. `stop` (replied / won / lost) ends the cadence.
 */
export function dueCadenceStep(input: { anchor: Date; stepsDone: number; now: Date; stop?: boolean; cadence?: CadenceStep[] }): DueStep | null {
  if (input.stop) return null;
  const cadence = input.cadence ?? DEFAULT_CADENCE;
  const step = cadence[input.stepsDone];
  if (!step) return null;
  const dueAt = new Date(input.anchor.getTime() + step.afterDays * DAY);
  if (dueAt.getTime() > input.now.getTime()) return null;
  return { index: input.stepsDone, step, dueAt, overdueDays: Math.floor((input.now.getTime() - dueAt.getTime()) / DAY) };
}
