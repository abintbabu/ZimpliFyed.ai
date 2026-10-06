import { AlertTriangle } from 'lucide-react';
import type { CreditCheckResult } from '@/lib/credit-exposure';

const fmt = (n: number, currency: string) => `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Warn-only credit-limit banner. Renders nothing when there is nothing to warn about. */
export function CreditWarning({ check, buyerName }: { check: CreditCheckResult | null; buyerName: string }) {
  if (!check || check.status === 'no_limit' || check.status === 'ok') return null;

  const cur = check.limitCurrency;
  let message: string;
  if (check.status === 'currency_mismatch') {
    message = `${buyerName}'s credit limit is ${fmt(check.creditLimit ?? 0, cur)}, but this amount is in a different currency, so exposure can't be compared. Current open balance: ${fmt(check.currentExposure, cur)}.`;
  } else if (check.status === 'over_limit') {
    message = `This takes ${buyerName} to ${fmt(check.projectedExposure, cur)} against a ${fmt(check.creditLimit ?? 0, cur)} credit limit — ${fmt(Math.abs(check.headroom ?? 0), cur)} over.`;
  } else {
    message = `${buyerName} would be at ${fmt(check.projectedExposure, cur)} of a ${fmt(check.creditLimit ?? 0, cur)} credit limit (${fmt(check.headroom ?? 0, cur)} headroom).`;
  }

  const over = check.status === 'over_limit';
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${over ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">{over ? 'Credit limit exceeded' : check.status === 'near_limit' ? 'Approaching credit limit' : 'Credit limit not comparable'}</p>
        <p>{message}</p>
        {check.unconvertedBalances.length > 0 && (
          <p className="text-xs opacity-80">
            Also outstanding in other currencies (not counted): {check.unconvertedBalances.map((b) => fmt(b.total, b.currency)).join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
