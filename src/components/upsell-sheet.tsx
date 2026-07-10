'use client';

import { useState } from 'react';
import { PLANS, type Feature } from '@/lib/billing/plans';
import { cheapestPlanWithFeature } from '@/lib/billing/plan-gate-client';
import { startCheckoutAction } from '@/actions/billing';

const FEATURE_LABELS: Record<Feature, string> = {
  core: 'This',
  doc_generator: 'The document generator',
  rfq_broadcast: 'Vendor RFQ broadcast',
  compliance_vault: 'The compliance vault',
  lc_advisor: 'The LC advisor',
  screening: 'Denied-party screening',
  custom_roles: 'Custom roles',
  whatsapp: 'WhatsApp integration',
};

/** Shared upsell affordance triggered by a caught plan_gate error (BILLING_SPEC §5) — never a dead error message. */
export function UpsellSheet({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = cheapestPlanWithFeature(feature);

  async function upgrade() {
    if (!plan) return;
    setPending(true);
    setError(null);
    try {
      const { url } = await startCheckoutAction(plan);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout');
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl border border-line bg-white p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">{FEATURE_LABELS[feature]} needs a higher plan</h2>
        <p className="mt-2 text-sm text-muted">
          {plan
            ? `Upgrade to ${PLANS[plan].label} to unlock this feature.`
            : 'This feature needs a custom plan — talk to us to get it enabled.'}
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex items-center gap-3">
          {plan ? (
            <button
              onClick={upgrade}
              disabled={pending}
              className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Starting checkout…' : `Upgrade to ${PLANS[plan].label}`}
            </button>
          ) : (
            <a href="mailto:sales@zimplifyed.ai" className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white">
              Talk to us
            </a>
          )}
          <button onClick={onClose} className="text-sm text-muted hover:text-ink">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
