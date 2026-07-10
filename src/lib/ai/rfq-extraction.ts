import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

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

/** Extracts a structured RFQ spec from raw buyer email/PDF text using Claude. */
export async function extractRfqSpec(rawText: string, tenantId: string, userId: string) {
  const result = await runAi({
    flowId: 'rfq_extraction',
    tier: 'extract',
    tenantId,
    userId,
    input: rawText,
    schema: RfqSpecSchema,
    maxTokens: 2048,
  });

  return { spec: result.output, interactionId: result.interactionId };
}
