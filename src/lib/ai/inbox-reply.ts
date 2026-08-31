import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

const InboxReplySchema = z.object({
  body: z.string().describe('Full draft reply body, ready to be reviewed and sent by a human — professional, concise export-trade tone. No subject line or greeting boilerplate beyond a normal email opener.'),
});

export type InboxReplyDraft = z.infer<typeof InboxReplySchema>;

/** Drafts a reply to an inbound inbox message. Output is always reviewed by a human via the Action Queue
 * before it's sent — this only produces the draft (CPO 2026-08-31: send is an action-queue consumer only). */
export async function draftInboxReply(
  context: string,
  tenantId: string,
  userId: string,
): Promise<{ draft: InboxReplyDraft; interactionId: string }> {
  const result = await runAi({
    flowId: 'inbox_reply',
    tier: 'draft',
    tenantId,
    userId,
    input: context,
    schema: InboxReplySchema,
    maxTokens: 1024,
  });

  return { draft: result.output, interactionId: result.interactionId };
}
