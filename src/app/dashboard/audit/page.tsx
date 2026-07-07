import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission, ROLE_LABELS } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';

export default async function AuditPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'users:manage')) redirect('/dashboard');

  const entries = await prisma.auditEntry.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Audit log</h1>

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Summary</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-4 py-2 text-muted">{e.createdAt.toLocaleString()}</td>
                <td className="px-4 py-2 text-ink">
                  {e.actorEmail}
                  {e.actorRole && <span className="ml-1 text-xs text-muted">({ROLE_LABELS[e.actorRole]})</span>}
                </td>
                <td className="px-4 py-2 text-muted">{e.action}</td>
                <td className="px-4 py-2 text-ink">{e.summary}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No activity recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
