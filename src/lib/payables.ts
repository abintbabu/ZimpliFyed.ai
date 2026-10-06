// Accounts payable (V2). Pure — no DB. Mirrors the receivables side: a bill's status and balance are derived
// from its payments, so they cannot disagree with them.

export type BillStatus = 'open' | 'partially_paid' | 'paid' | 'void';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function billBalance(total: number, payments: { amount: number }[]): number {
  return Math.max(0, r2(total - payments.reduce((s, p) => s + p.amount, 0)));
}

export function billStatusFor(total: number, payments: { amount: number }[], voided = false): BillStatus {
  if (voided) return 'void';
  const balance = billBalance(total, payments);
  if (balance <= 0.005) return 'paid';
  return payments.length > 0 && balance < total - 0.005 ? 'partially_paid' : 'open';
}

/** Error message for a proposed payment, or null. Overpaying a bill is refused — record an advance separately. */
export function validatePayment(total: number, existing: { amount: number }[], amount: number, status: BillStatus): string | null {
  if (status === 'void') return 'This bill is void.';
  if (status === 'paid') return 'This bill is already fully paid.';
  if (!(amount > 0)) return 'Payment amount must be above 0.';
  const balance = billBalance(total, existing);
  if (amount > balance + 0.005) return `That is more than the ${balance} still owed.`;
  return null;
}

export type OpenBill = { total: number; currency: string; dueDate: Date | null; payments: { amount: number }[]; status: BillStatus };

/** Outstanding balances of live bills. */
export function openBalances(bills: OpenBill[]): { currency: string; balance: number; dueDate: Date | null }[] {
  return bills
    .filter((b) => b.status !== 'void' && b.status !== 'paid')
    .map((b) => ({ currency: b.currency, balance: billBalance(b.total, b.payments), dueDate: b.dueDate }))
    .filter((b) => b.balance > 0.005);
}
