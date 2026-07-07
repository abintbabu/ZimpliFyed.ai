'use server';

import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { extractRfqSpec } from '@/lib/ai/rfq-extraction';
import { askCopilot, type CopilotMessage } from '@/lib/ai/copilot';

export async function extractRfqSpecFromText(rawText: string) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'vendors:write')) {
    throw new Error('You do not have permission to create RFQs');
  }
  if (!rawText.trim()) throw new Error('Paste the buyer email or spec text first');

  const spec = await extractRfqSpec(rawText);

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: 'draft',
    action: 'create',
    summary: `AI-extracted RFQ spec from pasted text: ${spec.product}`,
    metadata: { source: 'ai-extraction' },
  });

  return spec;
}

export async function askCopilotAction(history: CopilotMessage[]) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'analytics:read')) {
    throw new Error('You do not have permission to use Copilot');
  }
  if (history.length === 0) throw new Error('No message provided');

  return askCopilot(tenantId, history);
}
