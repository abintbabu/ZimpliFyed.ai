import 'server-only';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from './anthropic';

const LcReviewSchema = z.object({
  workable: z.boolean().describe('true if the LC terms are broadly workable against the order as-is'),
  summary: z.string().describe('One or two sentence overall assessment for a busy trader'),
  issues: z.array(
    z.object({
      clause: z.string().describe('The specific LC clause or requirement being flagged, quoted or closely paraphrased'),
      issue: z.string().describe('Why this clause is unworkable or risky against the order'),
      severity: z.enum(['low', 'medium', 'high']).describe('high = likely to cause a discrepancy/rejection at presentation'),
    }),
  ),
});

export type LcReview = z.infer<typeof LcReviewSchema>;

const SYSTEM_PROMPT = `You are a letter-of-credit advisor for an Indian exporter. Review the draft LC terms against the order details provided and flag clauses that are unworkable, contradictory to the order, or create discrepancy risk at document presentation — e.g. shipment/expiry dates too tight for the production and transit time, quantity/description tolerances that don't match the order, required documents the seller cannot realistically produce, price or Incoterm mismatches, or partial-shipment/transhipment restrictions incompatible with the shipping plan. Do not flag standard, workable LC boilerplate. This is advisory only — the exporter's bank and the buyer's bank make the final determination.`;

export async function reviewLcTerms(lcText: string, orderContext: string): Promise<LcReview> {
  const response = await anthropic.messages.parse({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `## Order details\n${orderContext}\n\n## Draft LC text\n${lcText}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(LcReviewSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Could not review this LC text');
  }

  return response.parsed_output;
}
