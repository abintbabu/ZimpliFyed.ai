import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

const BuyerFollowupSchema = z.object({
  subject: z.string().describe('Short subject line for the follow-up, e.g. "Re: sample approval for ORD-114"'),
  body: z.string().describe('Full draft message body, ready to be reviewed and sent by a human — professional, concise export-trade tone'),
});

export type BuyerFollowup = z.infer<typeof BuyerFollowupSchema>;

/** Drafts a follow-up nudge to a buyer from their recent context. Output is always reviewed by a human before being sent or logged. */
export async function draftBuyerFollowup(context: string, tenantId: string, userId: string) {
  const result = await runAi({
    flowId: 'buyer_followup',
    tier: 'draft',
    tenantId,
    userId,
    input: context,
    schema: BuyerFollowupSchema,
    maxTokens: 1024,
  });

  return { draft: result.output, interactionId: result.interactionId };
}
