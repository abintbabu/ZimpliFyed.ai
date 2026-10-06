// Company-level P&L (V2). Pure — no DB. An OPERATING view from what is recorded in the system: invoiced
// revenue (credit notes netted), booked expenses and vendor bills by month. It is not a ledger (the product keeps
// the general ledger out of scope — export to Tally for that) and it cannot know about costs entered nowhere.
// If the same cost is recorded both as a snapped expense and as a vendor bill it will be counted twice; the two
// lines are therefore kept SEPARATE so the user can see and reconcile them.

import { signedInvoiceTotal, type NoteKind } from './invoice-notes';
import type { ReportingPlan } from './fx';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export type PnlInvoice = { total: number; currency: string; status: string; createdAt: Date; isCreditOrDebitNote: boolean; noteKind?: NoteKind | null };
export type PnlExpense = { amount: number; currency: string | null; date: Date };
export type PnlBill = { total: number; currency: string; billDate: Date; status: string };

export type PnlMonth = { month: string; revenue: number; expenses: number; vendorBills: number; operatingProfit: number };

export type CompanyPnl = {
  months: PnlMonth[];
  totals: { revenue: number; expenses: number; vendorBills: number; operatingProfit: number; marginPct: number | null };
  /** Records excluded because their currency has no exchange rate. */
  excludedCount: number;
  notes: string[];
};

export function companyPnl(input: { invoices: PnlInvoice[]; expenses: PnlExpense[]; bills: PnlBill[]; now: Date; months: number; plan: ReportingPlan; defaultCurrency?: string }): CompanyPnl {
  const keys: string[] = [];
  for (let i = input.months - 1; i >= 0; i--) keys.push(monthKey(new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() - i, 1))));
  const acc = new Map<string, { revenue: number; expenses: number; vendorBills: number }>(keys.map((k) => [k, { revenue: 0, expenses: 0, vendorBills: 0 }]));
  let excluded = 0;

  const add = (k: string, field: 'revenue' | 'expenses' | 'vendorBills', amount: number, currency: string) => {
    const row = acc.get(k);
    if (!row) return;
    const v = input.plan.convert(amount, currency);
    if (v == null) { excluded += 1; return; }
    row[field] += v;
  };

  for (const i of input.invoices) if (i.status !== 'draft' && i.status !== 'void') add(monthKey(i.createdAt), 'revenue', signedInvoiceTotal(i), i.currency);
  for (const e of input.expenses) add(monthKey(e.date), 'expenses', e.amount, e.currency ?? input.defaultCurrency ?? input.plan.reportingCurrency);
  for (const b of input.bills) if (b.status !== 'void') add(monthKey(b.billDate), 'vendorBills', b.total, b.currency);

  const months: PnlMonth[] = keys.map((month) => {
    const a = acc.get(month)!;
    return { month, revenue: r2(a.revenue), expenses: r2(a.expenses), vendorBills: r2(a.vendorBills), operatingProfit: r2(a.revenue - a.expenses - a.vendorBills) };
  });
  const sum = (f: keyof Omit<PnlMonth, 'month'>) => r2(months.reduce((s, m) => s + m[f], 0));
  const revenue = sum('revenue');
  const totals = { revenue, expenses: sum('expenses'), vendorBills: sum('vendorBills'), operatingProfit: sum('operatingProfit'), marginPct: revenue > 0 ? r2((sum('operatingProfit') / revenue) * 100) : null };

  const notes = ['Operating view from recorded invoices, booked expenses and vendor bills — not a ledger.'];
  if (totals.expenses > 0 && totals.vendorBills > 0) notes.push('Expenses and vendor bills are shown separately: a cost entered both ways is counted twice.');
  return { months, totals, excludedCount: excluded, notes };
}
