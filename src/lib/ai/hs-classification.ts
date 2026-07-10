import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

const HsClassificationSchema = z.object({
  hsCode: z.string().describe('Best-estimate 6-8 digit HS/ITC-HS code for the product, e.g. "6302.60"'),
  dutyRatePct: z.number().nullable().describe('Estimated basic customs duty rate percentage for export from India, if reasonably determinable, else null'),
  rodtepRatePct: z.number().nullable().describe('Estimated RoDTEP scheme rate percentage for this HS code category, if reasonably determinable, else null'),
  rationale: z.string().describe('Brief rationale for the classification, referencing the product characteristics that drove the chosen heading'),
});

export type HsClassification = z.infer<typeof HsClassificationSchema>;

/** AI-assisted HS code classification — an estimate for the user to verify with a CHA, not a filing-ready determination. */
export async function classifyHsCode(description: string, tenantId: string, userId?: string) {
  const result = await runAi({
    flowId: 'hs_classification',
    tier: 'extract',
    tenantId,
    userId,
    input: description,
    schema: HsClassificationSchema,
    maxTokens: 1024,
  });

  return { classification: result.output, interactionId: result.interactionId };
}
