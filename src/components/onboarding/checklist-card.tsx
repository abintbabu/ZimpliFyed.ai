import Link from 'next/link';
import type { ChecklistState } from '@/actions/onboarding';

const STEPS: { key: keyof ChecklistState; label: string; href: string }[] = [
  { key: 'complianceFilled', label: 'Add your IEC / AD Code / LUT numbers', href: '/dashboard/compliance' },
  { key: 'teammateInvited', label: 'Invite a teammate', href: '/dashboard/users?invite=1' },
  { key: 'firstQuote', label: 'Create your first quote', href: '/dashboard/quotes/new' },
  { key: 'leadsImported', label: 'Add or import a lead', href: '/dashboard/leads?import=1' },
  { key: 'copilotUsed', label: 'Try the AI Copilot', href: '/dashboard/copilot' },
];

export function OnboardingChecklistCard({ state }: { state: ChecklistState }) {
  const done = STEPS.filter((s) => state[s.key]).length;
  if (done === STEPS.length) return null;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Get started</p>
        <p className="text-xs text-muted">{done}/{STEPS.length} done</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-brand-gradient" style={{ width: `${(done / STEPS.length) * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {STEPS.map((s) => (
          <li key={s.key}>
            {state[s.key] ? (
              <span className="flex items-center gap-2 text-sm text-muted line-through">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-[10px] text-success">✓</span>
                {s.label}
              </span>
            ) : (
              <Link href={s.href} className="flex items-center gap-2 text-sm text-ink-soft hover:text-brand">
                <span className="h-4 w-4 rounded-full border border-line" />
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
