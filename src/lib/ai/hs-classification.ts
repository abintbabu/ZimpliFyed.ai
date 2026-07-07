import 'server-only';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from './anthropic';

const HsClassificationSchema = z.object({
  hsCode: z.string().describe('Best-estimate 6-8 digit HS/ITC-HS code for the product, e.g. "6302.60"'),
  dutyRatePct: z.number().nullable().describe('Estimated basic customs duty rate percentage for export from India, if reasonably determinable, else null'),
  rodtepRatePct: z.number().nullable().describe('Estimated RoDTEP scheme rate percentage for this HS code category, if reasonably determinable, else null'),
  rationale: z.string().describe('Brief rationale for the classification, referencing the product characteristics that drove the chosen heading'),
});

export type HsClassification = z.infer<typeof HsClassificationSchema>;

const SYSTEM_PROMPT = `You are an HS (Harmonized System) code classification assistant for an Indian exporter. Given a product description, suggest the most likely ITC-HS code and, where you can reasonably estimate them, the basic customs duty rate and RoDTEP scheme rate. These are best-effort estimates from general knowledge, not a live tariff database — be conservative and use null for rates you are not reasonably confident about rather than guessing. Always state in the rationale that this is an AI estimate to be verified with a customs broker (CHA) before filing.`;

/** AI-assisted HS code classification — an estimate for the user to verify with a CHA, not a filing-ready determination. */
export async function classifyHsCode(description: string): Promise<HsClassification> {
  const response = await anthropic.messages.parse({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: description }],
    output_config: {
      format: zodOutputFormat(HsClassificationSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Could not classify this product description');
  }

  return response.parsed_output;
}
