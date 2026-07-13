import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';

/**
 * Buyer-enquiry extraction (DEV_PLAN_100 Sprint 5 — the "paste a buyer enquiry" onboarding aha).
 *
 * Unlike rfq-extraction (which reads a vendor-facing RFQ into a product spec), this reads an inbound buyer
 * email/WhatsApp message and pulls BOTH who is asking (to create/dedupe a Buyer + Lead) and what they want
 * (to seed a draft quote line). One extract call feeds the whole RFQ→quote chain.
 */

export const EnquirySchema = z.object({
  buyer: z.object({
    name: z.string().describe('The buyer company name if given, otherwise the person\'s name — never blank'),
    contactName: z.string().nullable().describe('The individual who wrote, if distinct from the company'),
    email: z.string().nullable().describe('Buyer email if present, else null'),
    phone: z.string().nullable().describe('Buyer phone/WhatsApp if present, else null'),
    country: z.string().nullable().describe('Buyer country if inferable, else null'),
  }),
  product: z.string().describe('Product name/description requested, e.g. "Cotton Bath Towel 500GSM"'),
  quantity: z.number().nullable().describe('Quantity as a plain number, null if not stated'),
  unit: z.string().nullable().describe('Unit for the quantity, e.g. "pcs", "kg", "dozen"'),
  specs: z.string().nullable().describe('Sizes, packing, and any other spec details, as one short line; null if none'),
  targetPrice: z.number().nullable().describe('Target unit price as a plain number if stated, else null'),
  targetPriceCurrency: z.string().nullable().describe('ISO currency for targetPrice, e.g. "USD", else null'),
  incoterm: z.string().nullable().describe('Incoterm mentioned, e.g. "FOB", "CIF", else null'),
});

export type Enquiry = z.infer<typeof EnquirySchema>;

/** Extract a structured buyer enquiry from raw email/WhatsApp/PDF text. */
export async function extractEnquiry(rawText: string, tenantId: string, userId: string) {
  const result = await runAi({
    flowId: 'enquiry_extract',
    tier: 'extract',
    tenantId,
    userId,
    input: rawText,
    schema: EnquirySchema,
    inputSummary: 'buyer enquiry extraction',
    maxTokens: 1024,
  });
  return { enquiry: result.output, interactionId: result.interactionId };
}
