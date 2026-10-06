// Quality inspection & production tracking (V3). Pure — no DB.
//
// IMPORTANT: the pass/fail rule here is a deliberate SIMPLIFICATION — defect percentage in the sample against
// the AQL percentage, critical defects always failing. It is NOT the ISO 2859-1 sampling plan (which uses
// lot-size/sample-size code letters and accept/reject numbers). Where a buyer's contract names an AQL plan, use
// the plan's own accept/reject numbers; this verdict is an internal screen, and the UI says so.

export type Defect = { severity: 'minor' | 'major' | 'critical'; count: number };

export type QcVerdict = { result: 'pass' | 'fail'; critical: number; major: number; minor: number; majorPct: number; minorPct: number; reasons: string[] };

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function qcVerdict(input: { sampleSize: number; defects: Defect[]; aqlMajor: number; aqlMinor: number }): QcVerdict {
  if (!(input.sampleSize > 0) || !Number.isInteger(input.sampleSize)) throw new Error('Sample size must be a whole number above 0.');
  const total = (s: Defect['severity']) => input.defects.filter((d) => d.severity === s).reduce((n, d) => n + Math.max(0, d.count), 0);
  const critical = total('critical'), major = total('major'), minor = total('minor');
  const majorPct = r2((major / input.sampleSize) * 100);
  const minorPct = r2((minor / input.sampleSize) * 100);
  const reasons: string[] = [];
  if (critical > 0) reasons.push(`${critical} critical defect(s) — any critical defect fails the lot.`);
  if (majorPct > input.aqlMajor) reasons.push(`Major defects ${majorPct}% exceed the ${input.aqlMajor}% limit.`);
  if (minorPct > input.aqlMinor) reasons.push(`Minor defects ${minorPct}% exceed the ${input.aqlMinor}% limit.`);
  return { result: reasons.length ? 'fail' : 'pass', critical, major, minor, majorPct, minorPct, reasons };
}

export type Stage = { name: string; plannedAt: Date | null; completedAt: Date | null };

const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export type RunProgress = {
  stagesDone: number;
  stagesTotal: number;
  /** Share of stages complete (0–100). */
  stagePct: number;
  /** Share of planned quantity produced (0–100, capped). */
  qtyPct: number;
  /** Stages whose planned date has passed without completion. */
  lateStages: string[];
  /** Days past the run's due date while not complete; 0 otherwise. */
  daysLate: number;
  status: 'on_track' | 'at_risk' | 'late' | 'done';
};

export function runProgress(input: { stages: Stage[]; plannedQty: number; producedQty: number; dueDate: Date | null; completed: boolean; now: Date }): RunProgress {
  const total = input.stages.length;
  const done = input.stages.filter((s) => s.completedAt).length;
  const lateStages = input.stages.filter((s) => !s.completedAt && s.plannedAt && utcDay(s.plannedAt) < utcDay(input.now)).map((s) => s.name);
  const stagePct = total ? r2((done / total) * 100) : 0;
  const qtyPct = input.plannedQty > 0 ? Math.min(100, r2((input.producedQty / input.plannedQty) * 100)) : 0;
  const daysLate = input.dueDate && !input.completed && utcDay(input.now) > utcDay(input.dueDate) ? Math.round((utcDay(input.now) - utcDay(input.dueDate)) / DAY) : 0;
  const status: RunProgress['status'] = input.completed ? 'done' : daysLate > 0 ? 'late' : lateStages.length > 0 ? 'at_risk' : 'on_track';
  return { stagesDone: done, stagesTotal: total, stagePct, qtyPct, lateStages, daysLate, status };
}
