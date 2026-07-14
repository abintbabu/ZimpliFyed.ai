import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listChannels, listMessages } from '@/actions/inbox';
import { InboxWorkbench } from './inbox-workbench';

/**
 * Unified inbox (Stage 2). One triage surface for the exporter's inbound stream so nothing lives only in
 * Gmail/WhatsApp: connect channels, drop in messages (paste today, provider webhook later), let the AI assign
 * intent + a one-line summary, and convert a buyer enquiry into a lead + draft quote in one tap.
 */
export default async function InboxPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'inbox:read')) {
    return <p className="text-sm text-muted">You do not have access to the inbox.</p>;
  }

  const canWrite = hasPermission(role, 'inbox:write');
  const [channels, messages] = await Promise.all([listChannels(tenantId), listMessages(tenantId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Your inbound stream — triage buyer enquiries into quotes, and route payments, logistics, and
          compliance messages to the right place.
        </p>
      </div>

      <InboxWorkbench channels={channels} messages={messages} canWrite={canWrite} />
    </div>
  );
}
