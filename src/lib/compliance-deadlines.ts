export type ComplianceStatus = 'expired' | 'expiring_soon' | 'ok' | 'no_expiry';

export const COMPLIANCE_CATEGORY_LABELS: Record<string, string> = {
  iec: 'IEC',
  ad_code: 'AD Code',
  gst_lut: 'GST / LUT',
  rcmc: 'RCMC',
  fssai: 'FSSAI',
  cdsco: 'CDSCO',
  bis: 'BIS',
  buyer_cert: 'Buyer-required cert',
  other: 'Other',
};

/** Start of the alert window for an item: renewalLeadDays before expiry. Used by the expiry sweep to decide
 * whether `lastAlertedAt` belongs to the current window (already alerted) or a previous one (alert again —
 * e.g. after a renewal pushed expiresAt out). */
export function alertWindowStart(expiresAt: Date, renewalLeadDays: number): Date {
  return new Date(expiresAt.getTime() - renewalLeadDays * 24 * 60 * 60 * 1000);
}

/** Renewal-lead-days-aware status: an item due within its own lead window is "expiring_soon", not just "ok until the last day". */
export function complianceStatus(expiresAt: Date | null, renewalLeadDays: number): ComplianceStatus {
  if (!expiresAt) return 'no_expiry';
  const now = new Date();
  if (expiresAt < now) return 'expired';
  const leadThreshold = new Date(now.getTime() + renewalLeadDays * 24 * 60 * 60 * 1000);
  if (expiresAt <= leadThreshold) return 'expiring_soon';
  return 'ok';
}
