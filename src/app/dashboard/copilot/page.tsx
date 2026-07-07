import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { CopilotChat } from './copilot-chat';

export default async function CopilotPage() {
  const { role } = await requireTenantSession();
  if (!hasPermission(role, 'analytics:read')) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Copilot</h1>
        <p className="text-sm text-muted">Ask about your leads, quotes, orders, and invoices.</p>
      </div>
      <CopilotChat />
    </div>
  );
}
