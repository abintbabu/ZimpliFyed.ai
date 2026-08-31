import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listActionQueue } from '@/actions/action-queue';
import { actionAcceptanceStats } from '@/lib/action-queue';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { ActionQueueList, type ActionItem } from './action-queue-list';

export default async function ActionQueuePage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'action_queue:read')) redirect('/dashboard');

  const [items, acceptance] = await Promise.all([listActionQueue(tenantId), actionAcceptanceStats(tenantId)]);
  const canApprove = hasPermission(role, 'action_queue:approve');

  const KIND_LABELS: Record<string, string> = {
    send_followup: 'Follow-ups',
    review_expense: 'Expense reviews',
    renew_compliance: 'Renewals',
    dunning_nudge: 'Payment chases',
    send_quote: 'Quotes',
    chase_vendor: 'Vendor chases',
    delay_alert: 'Delay alerts',
  };
  const readiness = acceptance
    .filter((s) => s.decided > 0)
    .map((s) => ({
      label: KIND_LABELS[s.kind] ?? s.kind,
      pct: s.acceptanceRate == null ? '—' : `${Math.round(s.acceptanceRate * 100)}%`,
      decided: s.decided,
      eligible: s.promotionEligible,
    }));

  // Serialise for the client boundary (Date → ISO); the queue is small so this is cheap.
  const rows: ActionItem[] = items.map((i) => ({
    id: i.id,
    kind: i.kind,
    department: i.department,
    title: i.title,
    summary: i.summary,
    payload: i.payload as Record<string, unknown> | null,
    confidence: i.confidence,
    linkedType: i.linkedType,
    linkedId: i.linkedId,
    createdAt: i.createdAt.toISOString(),
  }));

  const byDept = (d: string) => rows.filter((r) => r.department === d).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Action queue"
        description="One inbox for every action the AI has drafted across your departments. Approve to release it, edit first if you want to tweak, or reject. Nothing leaves the building until you tap Approve."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Sell" value={byDept('SELL')} tone={byDept('SELL') > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Money" value={byDept('MONEY')} tone={byDept('MONEY') > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Ship" value={byDept('SHIP')} />
        <StatCard label="Comply" value={byDept('COMPLY')} />
      </div>

      <ActionQueueList items={rows} canApprove={canApprove} />

      {readiness.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-medium text-ink">Autonomy readiness</p>
          <p className="mt-0.5 text-xs text-muted">
            Approve-without-edit rate per action type. At ≥60% over 100+ decisions, a workflow becomes a
            candidate to run with lighter review.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {readiness.map((r) => (
              <span
                key={r.label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs text-ink"
              >
                <span className="font-medium">{r.label}</span>
                <span className="text-muted">
                  {r.pct} · {r.decided} decided
                </span>
                {r.eligible && <span className="text-success">● ready</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
