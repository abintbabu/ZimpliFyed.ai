import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

export const ShippingDocSchema = z.object({
  blNumber: z.string().nullable().describe('Bill of lading / air waybill number as written, else null'),
  bookingNumber: z.string().nullable(),
  vesselOrFlight: z.string().nullable(),
  forwarderName: z.string().nullable(),
  originPort: z.string().nullable(),
  destPort: z.string().nullable(),
  etd: isoDate.describe('Estimated departure YYYY-MM-DD, null if absent or ambiguous'),
  eta: isoDate.describe('Estimated arrival YYYY-MM-DD, null if absent or ambiguous'),
  containers: z.array(z.object({
    containerNumber: z.string().describe('Exactly as written in the text'),
    sealNumber: z.string().nullable(),
    type: z.string().nullable().describe('e.g. 20GP, 40HC, as written'),
  })),
});

export type ShippingDoc = z.infer<typeof ShippingDocSchema>;

/** Proposes shipment particulars from a forwarder's email/text. A proposal only — a person reviews it. */
export async function extractShippingDoc(text: string, tenantId: string, userId: string) {
  const result = await runAi({ flowId: 'shipping_doc_extract', tier: 'extract', tenantId, userId, input: text, schema: ShippingDocSchema, maxTokens: 2048 });
  return { doc: result.output, interactionId: result.interactionId };
}
