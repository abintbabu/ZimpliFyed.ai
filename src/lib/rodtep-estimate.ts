// RoDTEP entitlement ESTIMATE (V2). Pure. The scheme's rates and per-item value caps are notified by the
// government and change; the rate available here is the one stored against the HS code — which for this product
// is an AI-classification estimate. So the result is an ESTIMATE with its provenance attached, never a
// claimable amount, and it must be checked against the current notification before anything is filed.

import { convertToBase, type FxRateMap } from './fx';

export type RodtepEstimate = {
  /** Estimated entitlement in INR, or null when it cannot be computed. */
  amountInr: number | null;
  fobValueInr: number | null;
  ratePct: number | null;
  /** Reasons the figure should not be trusted or could not be produced. */
  problems: string[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Rates above this are outside anything the scheme has published — almost certainly a data error. */
export const RODTEP_RATE_SANITY_MAX_PCT = 5;

export function estimateRodtep(input: { fobValue: number; currency: string; ratePct: number | null; rates: FxRateMap; rateIsAiEstimate: boolean }): RodtepEstimate {
  const problems: string[] = [];
  if (input.ratePct == null) problems.push('No RoDTEP rate on file for this HS code.');
  else if (!(input.ratePct >= 0)) problems.push('The stored rate is not valid.');
  else if (input.ratePct > RODTEP_RATE_SANITY_MAX_PCT) problems.push(`A ${input.ratePct}% rate is above any published RoDTEP rate — check the HS code and rate.`);
  if (input.ratePct != null && input.rateIsAiEstimate) problems.push('The rate is an AI estimate, not read from the notification — verify it before claiming.');
  problems.push('Per-item value caps and eligibility conditions are not applied.');

  const fobInr = convertToBase(input.fobValue, input.currency, input.rates);
  if (fobInr == null) problems.push(`No exchange rate for ${input.currency.toUpperCase()}.`);
  const usable = input.ratePct != null && input.ratePct >= 0 && input.ratePct <= RODTEP_RATE_SANITY_MAX_PCT && fobInr != null;
  return { amountInr: usable ? r2((fobInr! * input.ratePct!) / 100) : null, fobValueInr: fobInr, ratePct: input.ratePct, problems };
}
