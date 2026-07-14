import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

/**
 * Inbound-message triage (Stage 2 unified inbox). A cheap first pass over any inbound email/WhatsApp/
 * forwarder message that assigns a coarse intent and a one-line summary so the inbox can be sorted and
 * the right downstream flow suggested. The heavy structured pull (buyer + product → draft quote) stays in
 * enquiry-extraction and only runs when the message is an actual buyer enquiry — this keeps the per-message
 * cost low while still routing everything.
 */

export const InboxCategory = z.enum([
  'buyer_enquiry',
  'payment',
  'logistics',
  'compliance',
  'supplier',
  'spam',
  'other',
]);
export type InboxCategoryValue = z.infer<typeof InboxCategory>;

export const InboxClassificationSchema = z.object({
  category: InboxCategory.describe('The single best-fit intent for this inbound message'),
  summary: z.string().describe('One short line (max ~120 chars) capturing what the sender wants or is telling us'),
  isActionable: z.boolean().describe('True if this message needs a human or agent to do something'),
});

export type InboxClassification = z.infer<typeof InboxClassificationSchema>;

/** Classify one inbound message's intent. `rawText` is subject + body concatenated. */
export async function classifyInboundMessage(rawText: string, tenantId: string, userId?: string) {
  const result = await runAi({
    flowId: 'inbox_classify',
    tier: 'extract',
    tenantId,
    userId,
    input: rawText,
    schema: InboxClassificationSchema,
    inputSummary: 'inbox message classification',
    maxTokens: 512,
  });
  return { classification: result.output, interactionId: result.interactionId };
}
