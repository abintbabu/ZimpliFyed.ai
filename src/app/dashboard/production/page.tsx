import { Factory } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { listProductionRuns, listQcInspections } from '@/actions/production';
import { runProgress } from '@/lib/qc';
import { PageHeader } from '@/components/dashboard/page-header';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewRunForm, RunControls, QcForm } from './production-client';

export const metadata = { title: 'Production & quality' };
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = { done: 'bg-green-100 text-green-800', on_track: 'bg-blue-100 text-blue-800', at_risk: 'bg-amber-100 text-amber-800', late: 'bg-red-100 text-red-800' };

export default async function ProductionPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) return <p className="text-sm text-muted">You do not have access to production.</p>;
  const canWrite = hasPermission(role, 'orders:write');
  const [runs, inspections, orders] = await Promise.all([
    listProductionRuns(), listQcInspections(),
    canWrite ? prisma.order.findMany({ where: { tenantId, status: { notIn: ['cancelled', 'delivered'] } }, select: { id: true, orderNumber: true }, orderBy: { createdAt: 'desc' }, take: 100 }) : Promise.resolve([]),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <PageHeader title="Production & quality" description="Track production stages against the due date, and record inspections before goods ship." />
      {canWrite && <NewRunForm orders={orders} />}

      {runs.length === 0 ? <EmptyState icon={Factory} title="No production runs yet" description="Plan a run to track its stages and progress." /> : (
        <div className="space-y-3">
          {runs.map((r) => {
            const p = runProgress({ stages: r.stages, plannedQty: r.plannedQty, producedQty: r.producedQty, dueDate: r.dueDate, completed: r.status === 'completed', now });
            const label = r.status === 'cancelled' ? 'cancelled' : p.status;
            return (
              <div key={r.id} className={`space-y-2 rounded-2xl border border-line bg-white p-4 ${r.status === 'cancelled' ? 'opacity-50' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-mono text-xs text-muted">{r.runNumber}</span> <span className="font-medium text-ink">{r.productDescription}</span>{r.orderNumber && <span className="ml-2 text-xs text-muted">· {r.orderNumber}</span>}</div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[label] ?? 'bg-surface text-muted'}`}>{label.replace('_', ' ')}{p.daysLate > 0 && ` · ${p.daysLate}d past due`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-surface"><div className="h-full bg-brand/70" style={{ width: `${p.qtyPct}%` }} /></div>
                <p className="text-xs text-muted">{r.producedQty} of {r.plannedQty} produced · {p.stagesDone}/{p.stagesTotal} stages{r.dueDate && ` · due ${r.dueDate.toISOString().slice(0, 10)}`}{p.lateStages.length > 0 && ` · behind: ${p.lateStages.join(', ')}`}</p>
                <RunControls runId={r.id} producedQty={r.producedQty} status={r.status} stages={r.stages} canWrite={canWrite} />
              </div>
            );
          })}
        </div>
      )}

      {canWrite && <QcForm orders={orders} runs={runs.filter((r) => r.status !== 'cancelled').map((r) => ({ id: r.id, runNumber: r.runNumber }))} />}

      {inspections.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/[0.02] text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3">Inspection</th><th className="px-4 py-3">For</th><th className="px-4 py-3">Kind</th><th className="px-4 py-3 text-right">Sample</th><th className="px-4 py-3">Defects</th><th className="px-4 py-3">Result</th></tr></thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono text-xs text-ink">{i.inspectionNumber}<span className="block text-muted">{i.inspectedAt?.toISOString().slice(0, 10)}</span></td>
                  <td className="px-4 py-3 text-muted">{i.orderNumber ?? '—'}</td><td className="px-4 py-3 capitalize text-muted">{i.kind}</td><td className="px-4 py-3 text-right tabular-nums">{i.sampleSize}</td>
                  <td className="px-4 py-3 text-xs text-muted">{i.defects.length ? i.defects.map((d) => `${d.count} ${d.severity}`).join(', ') : 'none'}</td>
                  <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${i.result === 'pass' ? 'bg-green-100 text-green-800' : i.result === 'fail' ? 'bg-red-100 text-red-800' : 'bg-surface text-muted'}`}>{i.result}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
