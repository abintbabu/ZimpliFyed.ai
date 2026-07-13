import { LcChecker } from './lc-checker';

export const metadata = {
  title: 'Free Letter of Credit (LC) discrepancy checker for exporters',
  description:
    'Paste your export LC and get an AI review of unworkable clauses, date traps, and likely discrepancies before you ship. Decision support — always confirm with your bank/CHA.',
};

export default function LcCheckerPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">LC discrepancy checker</h1>
      <p className="mt-3 text-muted">
        Most LC rejections come from avoidable clause and date mismatches. Paste your letter of credit and get an
        AI read on what looks unworkable before presentation. Best-effort decision support — always confirm with
        your negotiating bank or CHA.
      </p>
      <div className="mt-8">
        <LcChecker />
      </div>
    </div>
  );
}
