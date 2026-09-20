import Link from 'next/link';
import { breadcrumbLd, jsonLd } from '@/lib/site';

export const metadata = {
  title: 'Free export & import tools — HS code finder, landed cost, LC checker',
  description:
    'Free tools for Indian exporters and importers: estimate ITC-HS codes, compute Incoterm-aware landed cost and margin, and check a letter of credit for discrepancies.',
  alternates: { canonical: '/tools' },
};

const TOOLS = [
  {
    href: '/tools/landed-cost',
    title: 'Landed cost & margin calculator',
    desc: 'Enter your cost build-up and Incoterm to see true per-unit landed cost, RoDTEP credit, and margin.',
  },
  {
    href: '/tools/hs-finder',
    title: 'HS code finder',
    desc: 'Describe your product and get an AI-estimated ITC-HS code with duty and RoDTEP rate hints.',
  },
  {
    href: '/tools/lc-checker',
    title: 'LC discrepancy checker',
    desc: 'Paste your export letter of credit and get an AI read on unworkable clauses and date traps before you ship.',
  },
];

export default function ToolsIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Free tools', path: '/tools' }]))}
      />
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Free tools for exporters</h1>
      <p className="mt-3 text-muted">No sign-up required. Built by the team behind Zimplifyed.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-2xl border border-line bg-white p-6 transition hover:border-brand">
            <h2 className="text-lg font-semibold text-ink">{t.title}</h2>
            <p className="mt-2 text-sm text-muted">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
