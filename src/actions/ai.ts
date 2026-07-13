'use server';

import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { extractRfqSpec } from '@/lib/ai/rfq-extraction';
import { askCopilot, type CopilotMessage } from '@/lib/ai/copilot';
import { prisma } from '@/lib/prisma';
import type { AiFeedbackRating } from '@prisma/client';

export async function extractRfqSpecFromText(rawText: string) {
  const session = await requireTenantSession();
  if (!hasPermission(session.role, 'vendors:write')) {
    throw new Error('You do not have permission to create RFQs');
  }
  if (!rawText.trim()) throw new Error('Paste the buyer email or spec text first');

  const { spec, interactionId } = await extractRfqSpec(rawText, session.tenantId, session.userId);

  await writeAudit({
    session,
    collection: 'vendor_rfqs',
    documentId: 'draft',
    action: 'create',
    summary: `AI-extracted RFQ spec from pasted text: ${spec.product}`,
    metadata: { source: 'ai-extraction' },
  });

  return { ...spec, interactionId };
}

export async function askCopilotAction(history: CopilotMessage[]) {
  const { tenantId, userId, role } = await requireTenantSession();
  if (history.length === 0) throw new Error('No message provided');

  const { text, interactionId } = await askCopilot(tenantId, userId, role, history);

  return { text, interactionId };
}

export async function submitAiFeedback(interactionId: string, rating: AiFeedbackRating, note?: string, editedOutput?: unknown) {
  const { tenantId } = await requireTenantSession();

  const interaction = await prisma.aiInteraction.findFirst({ where: { id: interactionId, tenantId } });
  if (!interaction) throw new Error('AI interaction not found');

  await prisma.$transaction([
    prisma.aiFeedback.upsert({
      where: { aiInteractionId: interactionId },
      create: { aiInteractionId: interactionId, rating, note },
      update: { rating, note },
    }),
    ...(editedOutput !== undefined
      ? [prisma.aiInteraction.update({ where: { id: interactionId }, data: { editedOutput: editedOutput as object } })] // tenant-safe: interactionId verified tenant-owned via findFirst above
      : []),
  ]);
}
