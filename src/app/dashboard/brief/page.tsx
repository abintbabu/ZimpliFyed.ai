import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { buildFounderBrief, type BriefItem } from '@/lib/founder-brief';

export const metadata = { title: 'Daily brief' };
export const dynamic = 'force-dynamic';

const DOT: Record<BriefItem['severity'], string> = {
  urgent: 'bg-danger',
  attention: 'bg-amber-500',
  info: 'bg-brand',
};

export default async function BriefPage() {
  const { tenantId } = await requireTenantSession();
  const brief = await buildFounderBrief(tenantId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Daily brief</h1>
        <p className="mt-1 text-sm text-muted">
          {brief.generatedAt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <p className="text-lg font-medium text-ink">{brief.headline}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Overdue receivables" value={brief.cash.overdueReceivables} sub={`${brief.cash.overdueCount} invoice(s)`} danger />
        <Tile label="Outstanding receivables" value={brief.cash.outstandingReceivables} />
      </div>

      {brief.items.length > 0 && (
        <div className="rounded-2xl border border-line bg-white divide-y divide-line">
          {brief.items.map((item, i) => {
            const body = (
              <div className="flex items-start gap-3 p-4">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[item.severity]}`} />
                <span className="text-sm text-ink-soft">{item.text}</span>
              </div>
            );
            return item.href
              ? <Link key={i} href={item.href} className="block hover:bg-surface">{body}</Link>
              : <div key={i}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, danger }: { label: string; value: number; sub?: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${danger && value > 0 ? 'text-danger' : 'text-ink'}`}>{value.toFixed(2)}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
