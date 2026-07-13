import Link from 'next/link';
import { Check } from 'lucide-react';
import { PLANS, MONTHLY_INR, OVERAGE_INR, isUnlimited } from '@/lib/billing/plans';
import type { TenantPlan } from '@prisma/client';

export const metadata = {
  title: 'Pricing — Zimplifyed, the AI-first exporter OS',
  description:
    'Simple INR pricing for Indian exporters. Start free, upgrade when it pays for itself. One document set costs less than a fraction of a CHA’s per-shipment fee.',
};

const ORDER: TenantPlan[] = ['free', 'starter', 'growth', 'enterprise'];

const TAGLINE: Record<TenantPlan, string> = {
  free: 'Try the workflow on real orders.',
  starter: 'For a solo exporter or a small desk.',
  growth: 'For a growing team that runs on it daily.',
  enterprise: 'For high-volume houses and custom needs.',
};

/** Human-readable highlights per plan — kept short; the entitlements themselves come from PLANS. */
function highlights(plan: TenantPlan): string[] {
  const p = PLANS[plan];
  const seats = isUnlimited(p.seats) ? 'Unlimited seats' : `${p.seats} seats`;
  const docs = plan === 'free' ? 'Document generator on paid plans' : `${p.docSets} document sets / mo`;
  const ai = `${p.aiActions.toLocaleString()} AI actions / mo`;
  const extras: Record<TenantPlan, string[]> = {
    free: ['CRM, quotes & orders', 'Landed-cost & HS tools'],
    starter: ['Export document generator', 'Vendor RFQ broadcast'],
    growth: ['Compliance vault & LC advisor', 'Denied-party screening', 'WhatsApp & custom roles'],
    enterprise: ['Everything in Business', 'Custom limits & onboarding', 'Priority support'],
  };
  return [seats, ai, docs, ...extras[plan]];
}

function priceLabel(plan: TenantPlan): { big: string; sub: string } {
  const inr = MONTHLY_INR[plan];
  if (inr === 0) return { big: '₹0', sub: 'forever' };
  if (isUnlimited(inr)) return { big: 'Custom', sub: 'talk to us' };
  return { big: `₹${inr.toLocaleString('en-IN')}`, sub: '/ month' };
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Pricing that pays for itself</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Start free. A single generated document set costs <strong className="text-ink">₹{OVERAGE_INR.docSet}</strong> in
        overage — against the <strong className="text-ink">~₹4,000</strong> a CHA typically charges to prepare one
        shipment’s paperwork. Extra AI actions are ₹{OVERAGE_INR.aiActionsPer100} per 100.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ORDER.map((plan) => {
          const price = priceLabel(plan);
          const featured = plan === 'growth';
          return (
            <div
              key={plan}
              className={`flex flex-col rounded-2xl border bg-white p-6 ${featured ? 'border-brand shadow-lg' : 'border-line'}`}
            >
              {featured && <span className="mb-3 w-fit rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">Most popular</span>}
              <h2 className="text-lg font-semibold text-ink">{PLANS[plan].label}</h2>
              <p className="mt-1 text-sm text-muted">{TAGLINE[plan]}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-semibold text-ink">{price.big}</span>
                <span className="text-sm text-muted">{price.sub}</span>
              </div>

              <ul className="mt-5 flex-1 space-y-2">
                {highlights(plan).map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-ink-soft">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {h}
                  </li>
                ))}
              </ul>

              <Link
                href={plan === 'enterprise' ? '/signup?plan=enterprise' : '/signup'}
                className={`mt-6 rounded-lg px-4 py-2 text-center text-sm font-semibold ${featured ? 'bg-brand-gradient text-white' : 'border border-line text-ink hover:border-brand'}`}
              >
                {plan === 'free' ? 'Start free' : plan === 'enterprise' ? 'Contact us' : 'Start free trial'}
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-muted">
        Prices in INR, billed monthly, GST extra. Government filings and payments are always prepared for your
        approval, never filed automatically. Cancel anytime — your data is never deleted for non-payment.
      </p>
    </div>
  );
}
