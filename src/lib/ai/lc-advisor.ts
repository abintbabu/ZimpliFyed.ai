import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

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

export async function reviewLcTerms(lcText: string, orderContext: string, tenantId: string, userId: string) {
  const result = await runAi({
    flowId: 'lc_advisor',
    tier: 'reason',
    tenantId,
    userId,
    input: `## Order details\n${orderContext}\n\n## Draft LC text\n${lcText}`,
    schema: LcReviewSchema,
    maxTokens: 2048,
  });

  return { review: result.output, interactionId: result.interactionId };
}
