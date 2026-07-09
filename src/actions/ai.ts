'use server';

import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { extractRfqSpec } from '@/lib/ai/rfq-extraction';
import { askCopilot, type CopilotMessage } from '@/lib/ai/copilot';
import { recordAiInteraction } from '@/lib/ai/metering';
import { prisma } from '@/lib/prisma';
import type { AiFeedbackRating } from '@prisma/client';

export async function extractRfqSpecFromText(rawText: string) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'vendors:write')) {
    throw new Error('You do not have permission to create RFQs');
  }
  if (!rawText.trim()) throw new Error('Paste the buyer email or spec text first');

  const result = await extractRfqSpec(rawText);

  const interaction = await recordAiInteraction({
    tenantId: session.tenantId,
    userId: session.userId,
    feature: 'rfq_extraction',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: 'draft',
    action: 'create',
    summary: `AI-extracted RFQ spec from pasted text: ${result.spec.product}`,
    metadata: { source: 'ai-extraction' },
  });

  return { ...result.spec, interactionId: interaction.id };
}

export async function askCopilotAction(history: CopilotMessage[]) {
  const { tenantId, userId, role } = await requireTenantSession();
  if (!hasPermission(role, 'analytics:read')) {
    throw new Error('You do not have permission to use Copilot');
  }
  if (history.length === 0) throw new Error('No message provided');

  const result = await askCopilot(tenantId, history);

  const interaction = await recordAiInteraction({
    tenantId,
    userId,
    feature: 'copilot',
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  return { text: result.text, interactionId: interaction.id };
}

export async function submitAiFeedback(interactionId: string, rating: AiFeedbackRating, note?: string) {
  const { tenantId } = await requireTenantSession();

  const interaction = await prisma.aiInteraction.findFirst({ where: { id: interactionId, tenantId } });
  if (!interaction) throw new Error('AI interaction not found');

  await prisma.aiFeedback.upsert({
    where: { aiInteractionId: interactionId },
    create: { aiInteractionId: interactionId, rating, note },
    update: { rating, note },
  });
}
