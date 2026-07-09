import 'server-only';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from './anthropic';

const BuyerFollowupSchema = z.object({
  subject: z.string().describe('Short subject line for the follow-up, e.g. "Re: sample approval for ORD-114"'),
  body: z.string().describe('Full draft message body, ready to be reviewed and sent by a human — professional, concise export-trade tone'),
});

export type BuyerFollowup = z.infer<typeof BuyerFollowupSchema>;

const SYSTEM_PROMPT = `You draft follow-up messages for an Indian exporter's sales team to send to overseas buyers. Use a professional, concise export-trade tone. Reference concrete details from the context given (recent activity, open quotes/orders) rather than generic filler. Never invent facts, prices, or dates not present in the context — if something is unclear, phrase the message to ask the buyer rather than assume. This is a draft for a human to review and edit before sending; do not include placeholder brackets like "[insert X]", write it as if ready to send but flag genuine unknowns as a question to the buyer instead.`;

const BUYER_FOLLOWUP_MODEL = 'claude-opus-4-8';

export type BuyerFollowupResult = {
  draft: BuyerFollowup;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

/** Drafts a follow-up nudge to a buyer from their recent context. Output is always reviewed by a human before being sent or logged. */
export async function draftBuyerFollowup(context: string): Promise<BuyerFollowupResult> {
  const response = await anthropic.messages.parse({
    model: BUYER_FOLLOWUP_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: context }],
    output_config: {
      format: zodOutputFormat(BuyerFollowupSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Could not draft a follow-up for this buyer');
  }

  return {
    draft: response.parsed_output,
    model: response.model,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
  };
}
