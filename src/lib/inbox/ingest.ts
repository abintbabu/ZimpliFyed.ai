import 'server-only';
import { prisma } from '@/lib/prisma';
import { writeDomainEvent } from '@/lib/domain-events';
import { classifyInboundMessage } from '@/lib/ai/inbox-classification';

/**
 * Background classification of one inbound message (job kind `inbox.ingest`). Loads the row, runs the cheap
 * intent classifier, and stamps category/summary. Idempotent: a message already classified is skipped, so a
 * crash-retry never re-bills the AI budget or clobbers a human's later edits.
 */
export async function runInboxIngest(messageId: string, tenantId: string): Promise<void> {
  const message = await prisma.inboxMessage.findFirst({
    where: { id: messageId, tenantId },
    select: { id: true, subject: true, body: true, category: true },
  });
  if (!message) return; // deleted between enqueue and run — nothing to do
  if (message.category) return; // already classified

  const rawText = [message.subject, message.body].filter(Boolean).join('\n\n').trim();
  if (!rawText) return;

  const { classification, interactionId } = await classifyInboundMessage(rawText, tenantId);

  await prisma.inboxMessage.update({
    where: { id: message.id },
    data: {
      category: classification.category,
      summary: classification.summary,
      aiInteractionId: interactionId,
    },
  });

  await writeDomainEvent(prisma, {
    tenantId,
    type: 'inbox.message_received',
    refId: message.id,
    payload: { category: classification.category, isActionable: classification.isActionable },
  });
}
