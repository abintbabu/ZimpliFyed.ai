import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getImportEntry } from '@/actions/imports';
import { ImportEditor } from './import-editor';

export const dynamic = 'force-dynamic';

export default async function ImportEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'vendors:read')) return <p className="text-sm text-muted">You do not have access to imports.</p>;
  const entry = await getImportEntry(id);
  if (!entry) notFound();
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/imports" className="text-xs text-brand hover:underline">← Imports</Link>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{entry.entryNumber} <span className="text-sm font-normal capitalize text-muted">{entry.status}</span></h1>
      </div>
      <ImportEditor entry={entry} canWrite={hasPermission(role, 'vendors:write')} />
    </div>
  );
}
