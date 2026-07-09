import { HsFinder } from './finder';

export const metadata = {
  title: 'HS code finder for Indian exporters (ITC-HS)',
  description: 'Free AI HS code finder. Describe your product and get an estimated ITC-HS code with duty and RoDTEP rate hints. Verify with your CHA before filing.',
};

export default function HsFinderPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">HS code finder</h1>
      <p className="mt-3 text-muted">
        Describe your product and get an AI-estimated ITC-HS code. These are best-effort estimates — always confirm with a customs broker (CHA) before filing.
      </p>
      <div className="mt-8">
        <HsFinder />
      </div>
    </div>
  );
}
