import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const LcTermsSchema = z.object({
  amount: z.number().nullable().describe('LC amount as a plain number, null if not stated'),
  currency: z.string().nullable().describe('3-letter currency code, null if not stated'),
  expiryDate: isoDate.describe('Expiry date YYYY-MM-DD, null if absent or ambiguous'),
  latestShipmentDate: isoDate.describe('Latest date of shipment YYYY-MM-DD, null if absent or ambiguous'),
  requiredDocuments: z.array(z.string()).describe('One entry per required document, in the LC\'s own words'),
  presentationDays: z.number().nullable().describe('Stated presentation period in days after shipment, else null'),
  tolerancePct: z.number().nullable().describe('Stated amount tolerance in percent, else null'),
  partialShipmentsAllowed: z.boolean().nullable(),
  transhipmentAllowed: z.boolean().nullable(),
});

export type LcTerms = z.infer<typeof LcTermsSchema>;

/** Proposes structured LC terms from the LC text. A proposal only — a person reviews it before anything is saved. */
export async function extractLcTermsFromText(rawText: string, tenantId: string, userId: string) {
  const result = await runAi({ flowId: 'lc_extract', tier: 'extract', tenantId, userId, input: rawText, schema: LcTermsSchema, maxTokens: 2048 });
  return { terms: result.output, interactionId: result.interactionId };
}
