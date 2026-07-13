import { Info } from 'lucide-react';

/**
 * Shared "decision support, not professional advice" notice (DEV_PLAN_100 Sprint 6 — design-partner / legal
 * launch blocker). Placed on AI-assisted surfaces that touch filings, customs, or statutory money: the doc
 * engine, the GST/incentive surfaces, LC review. Zimplifyed prepares and routes — it never files or certifies.
 */
export function AdvisoryDisclaimer({ kind = 'generic' }: { kind?: 'docs' | 'gst' | 'lc' | 'generic' }) {
  const text: Record<'docs' | 'gst' | 'lc' | 'generic', string> = {
    docs: 'Generated documents are decision-support drafts, not a substitute for your CHA or customs broker. Review every field before you file or present them.',
    gst: 'Incentive and GST figures are AI-assisted estimates for planning, not tax advice. Zimplifyed prepares and routes — it never files. Confirm with your CA before claiming.',
    lc: 'This LC review is best-effort decision support, not legal or banking advice. Always confirm discrepancies with your negotiating bank before shipment.',
    generic: 'AI-assisted output for decision support only — not professional (CA/CHA/legal) advice. Verify before acting.',
  };
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text[kind]}</span>
    </p>
  );
}
