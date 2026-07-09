import { LandedCostCalculator } from './calculator';

export const metadata = {
  title: 'Landed cost & margin calculator for Indian exporters',
  description: 'Free Incoterm-aware landed cost calculator. Enter your cost build-up, pick an Incoterm, and see per-unit landed cost, RoDTEP credit and margin.',
};

export default function LandedCostToolPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Landed cost &amp; margin calculator</h1>
      <p className="mt-3 text-muted">
        Only the cost categories your Incoterm makes you responsible for count toward landed cost. RoDTEP is netted off as an export credit.
      </p>
      <div className="mt-8">
        <LandedCostCalculator />
      </div>
      <p className="mt-8 text-xs text-muted">
        Estimates for planning only. Verify duty and RoDTEP rates with your customs broker before quoting.
      </p>
    </div>
  );
}
