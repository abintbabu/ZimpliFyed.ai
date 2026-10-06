// Customer credit-limit check. Pure — no DB, no clock — so it is unit-testable and the server action
// only has to supply the buyer's open invoices.
//
// There is no FX model yet, so exposure is only ever summed within ONE currency. A buyer's limit is held
// in `Buyer.currencyDefault`; if the amount being checked is in a different currency the check cannot be
// evaluated honestly and says so (`currency_mismatch`) rather than comparing unlike numbers. Open
// balances in other currencies are surfaced, never silently dropped or summed in.

export type CreditStatus = 'no_limit' | 'ok' | 'near_limit' | 'over_limit' | 'currency_mismatch';

/** Share of the limit at which a buyer is flagged as approaching it. */
export const NEAR_LIMIT_RATIO = 0.8;

export type OpenBalance = { currency: string; balanceDue: number };

export type CreditCheckInput = {
  creditLimit: number | null;
  /** Currency the credit limit is denominated in (Buyer.currencyDefault). */
  limitCurrency: string;
  /** Unpaid balances on the buyer's non-credit/debit-note invoices. */
  openBalances: OpenBalance[];
  /** The quote/order amount being added to exposure. */
  newAmount: number;
  newAmountCurrency: string;
};

export type CreditCheckResult = {
  status: CreditStatus;
  creditLimit: number | null;
  limitCurrency: string;
  /** Open balances in the limit currency. */
  currentExposure: number;
  /** currentExposure + newAmount (only meaningful when the amount is in the limit currency). */
  projectedExposure: number;
  /** creditLimit - projectedExposure; negative when over. Null when there is no limit. */
  headroom: number | null;
  /** Open balances in other currencies that could not be compared against the limit. */
  unconvertedBalances: { currency: string; total: number }[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function evaluateCredit(input: CreditCheckInput): CreditCheckResult {
  const limitCurrency = input.limitCurrency.toUpperCase();
  const amountCurrency = input.newAmountCurrency.toUpperCase();

  const sameCurrency = input.openBalances.filter((b) => b.currency.toUpperCase() === limitCurrency);
  const currentExposure = round2(sameCurrency.reduce((s, b) => s + b.balanceDue, 0));

  const otherTotals = new Map<string, number>();
  for (const b of input.openBalances) {
    const c = b.currency.toUpperCase();
    if (c === limitCurrency) continue;
    otherTotals.set(c, (otherTotals.get(c) ?? 0) + b.balanceDue);
  }
  const unconvertedBalances = [...otherTotals.entries()]
    .filter(([, total]) => total > 0.01)
    .map(([currency, total]) => ({ currency, total: round2(total) }));

  const base = {
    creditLimit: input.creditLimit,
    limitCurrency,
    currentExposure,
    unconvertedBalances,
  };

  if (input.creditLimit == null || input.creditLimit <= 0) {
    return { ...base, status: 'no_limit', projectedExposure: round2(currentExposure + (amountCurrency === limitCurrency ? input.newAmount : 0)), headroom: null };
  }

  if (amountCurrency !== limitCurrency) {
    return { ...base, status: 'currency_mismatch', projectedExposure: currentExposure, headroom: null };
  }

  const projectedExposure = round2(currentExposure + input.newAmount);
  const headroom = round2(input.creditLimit - projectedExposure);
  const status: CreditStatus =
    projectedExposure > input.creditLimit ? 'over_limit'
    : projectedExposure >= input.creditLimit * NEAR_LIMIT_RATIO ? 'near_limit'
    : 'ok';

  return { ...base, status, projectedExposure, headroom };
}
