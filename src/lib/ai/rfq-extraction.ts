import 'server-only';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from './anthropic';

export const RfqSpecSchema = z.object({
  product: z.string().describe('Product name/description, e.g. "Cotton Bath Towel 500GSM"'),
  quantity: z.number().nullable().describe('Ordered quantity as a plain number, null if not stated'),
  unit: z.string().nullable().describe('Unit for the quantity, e.g. "pcs", "kg", "dozen"'),
  sizes: z.array(z.string()).describe('Any sizes/dimensions mentioned, e.g. ["70x140cm", "S/M/L"]'),
  packing: z.string().nullable().describe('Packing/carton requirements if mentioned, else null'),
  targetPrice: z.number().nullable().describe('Target unit price as a plain number if stated, else null'),
  targetPriceCurrency: z.string().nullable().describe('Currency code for targetPrice, e.g. "USD", else null'),
  deliveryTerms: z.string().nullable().describe('Incoterm and/or delivery timeline mentioned, e.g. "FOB, 45 days"'),
});

export type RfqSpec = z.infer<typeof RfqSpecSchema>;

const SYSTEM_PROMPT = `You extract structured RFQ (request-for-quote) specs from buyer emails or documents for an export trading company. Extract only what is explicitly stated; use null (or an empty array for sizes) for anything not mentioned. Do not guess or infer values that are not in the text.`;

const RFQ_EXTRACTION_MODEL = 'claude-opus-4-8';

export type RfqExtractionResult = {
  spec: RfqSpec;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

/** Extracts a structured RFQ spec from raw buyer email/PDF text using Claude. */
export async function extractRfqSpec(rawText: string): Promise<RfqExtractionResult> {
  const response = await anthropic.messages.parse({
    model: RFQ_EXTRACTION_MODEL,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawText }],
    output_config: {
      format: zodOutputFormat(RfqSpecSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Could not extract a structured RFQ spec from the provided text');
  }

  return {
    spec: response.parsed_output,
    model: response.model,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
  };
}
