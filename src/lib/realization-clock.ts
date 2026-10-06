// Export-proceeds realisation clock (V2). Pure — no DB, no clock.
//
// Under FEMA the exporter must realise export proceeds within a prescribed period of the date of export —
// nine months for ordinary goods exports at the time of writing. The period and its exceptions (extensions
// granted by the AD bank, goods in warehouses abroad) are RBI's to set and change, so the period is a
// parameter, and every status here is advisory: confirm with your AD bank before relying on a date.

export const DEFAULT_REALIZATION_MONTHS = 9;
export const DUE_SOON_DAYS = 60;

const DAY = 86_400_000;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Adds calendar months; a 31 Jan + 1 month lands on the last day of February, not in March. */
export function addMonthsClamped(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

export type RealizationStatus = 'realized' | 'overdue' | 'due_soon' | 'open' | 'unknown';

export type RealizationClock = {
  status: RealizationStatus;
  deadline: Date | null;
  /** Whole days to the deadline; negative once passed. Null when the export date is unknown. */
  daysLeft: number | null;
  outstanding: number;
  realizedPct: number;
};

export function realizationClock(input: { exportDate: Date | null; invoiceTotal: number; realized: number; now: Date; months?: number }): RealizationClock {
  const outstanding = Math.max(0, r2(input.invoiceTotal - input.realized));
  const realizedPct = input.invoiceTotal > 0 ? Math.min(100, r2((input.realized / input.invoiceTotal) * 100)) : 0;
  if (outstanding <= 0.005 && input.invoiceTotal > 0) return { status: 'realized', deadline: input.exportDate ? addMonthsClamped(input.exportDate, input.months ?? DEFAULT_REALIZATION_MONTHS) : null, daysLeft: null, outstanding: 0, realizedPct: 100 };
  if (!input.exportDate) return { status: 'unknown', deadline: null, daysLeft: null, outstanding, realizedPct };

  const deadline = addMonthsClamped(input.exportDate, input.months ?? DEFAULT_REALIZATION_MONTHS);
  const daysLeft = Math.round((utcDay(deadline) - utcDay(input.now)) / DAY);
  const status: RealizationStatus = daysLeft < 0 ? 'overdue' : daysLeft <= DUE_SOON_DAYS ? 'due_soon' : 'open';
  return { status, deadline, daysLeft, outstanding, realizedPct };
}
