import 'server-only';
import { z } from 'zod';
import { runAi, type AiImage } from '@/ai/router';
import { prisma } from '@/lib/prisma';
import { getObject } from '@/lib/storage';
import { writeDomainEvent } from '@/lib/domain-events';

/**
 * Expense pipeline (DEV_PLAN_100 Sprint 4): image/PDF/UPI screenshot → vision extract → GST-head +
 * ITC-eligibility classification → confidence gate → auto-post to the order P&L, or park in the review queue.
 *
 * This is the first pipeline on the vision primitive (runAi `images`). It is deliberately shaped so the inbox
 * (Stage 2) and bank-statement (Stage 4) pipelines can follow the same extract → gate → auto-record|review
 * spine. Every extraction logs an AiInteraction (via runAi) so accuracy is measurable from day one.
 */

/** Extraction confidence at/above which an expense posts straight to the ledger; below it, a human reviews.
 * Chosen conservatively — a wrong auto-posted expense corrupts the order P&L, a queued one costs one tap. */
export const AUTO_POST_THRESHOLD = 0.85;

export const GST_HEADS = [
  'Freight & Logistics',
  'Packaging Materials',
  'Raw Materials',
  'Professional & Legal',
  'Office & Admin',
  'Travel',
  'Utilities',
  'Bank & Financial Charges',
  'Marketing',
  'Other',
] as const;

export const ExpenseExtractionSchema = z.object({
  vendorName: z.string().nullable().describe('Merchant/supplier the money went to; payee for a UPI screenshot'),
  amount: z.number().nullable().describe('Total amount paid; never invented — null if illegible'),
  currency: z.string().describe('ISO currency code, e.g. INR'),
  expenseDate: z.string().nullable().describe('Document/transaction date, ISO YYYY-MM-DD, or null'),
  gstHead: z.enum(GST_HEADS).describe('Best-fit GST bookkeeping category'),
  itcEligible: z.boolean().nullable().describe('True only for a valid GST tax invoice with a GSTIN + GST amount'),
  confidence: z.number().min(0).max(1).describe('Overall confidence the amount and vendor are correct/legible'),
});

export type ExpenseExtraction = z.infer<typeof ExpenseExtractionSchema>;

/** Run the vision extraction over a single expense image. Pure-ish: no DB writes beyond the AiInteraction
 * audit row runAi always writes. Separated from persistence so it is independently eval-testable. */
export async function extractExpenseFromImage(
  image: AiImage,
  tenantId: string,
  userId?: string,
): Promise<{ extraction: ExpenseExtraction; interactionId: string }> {
  const result = await runAi({
    flowId: 'expense_extract',
    tier: 'extract',
    tenantId,
    userId,
    input: 'Extract the expense fields from the attached document.',
    images: [image],
    schema: ExpenseExtractionSchema,
    inputSummary: 'expense image extraction',
    maxTokens: 512,
  });
  return { extraction: result.output, interactionId: result.interactionId };
}

/** A PDF is passed to the model as-is (Anthropic accepts application/pdf as a document image); everything
 * else is treated as an image. Both ride the same base64 attachment path. */
function toAiImage(bytes: Buffer, mimeType: string): AiImage {
  return { mediaType: mimeType, dataBase64: bytes.toString('base64') };
}

/**
 * Process one queued Expense row: fetch its source file, extract, classify, gate, and persist. Idempotent —
 * an expense that has already been scored (confidence set) is left alone, so a crash-retry of the job can't
 * double-post or overwrite a human's review.
 */
export async function runExpensePipeline(expenseId: string, tenantId: string): Promise<void> {
  const expense = await prisma.expense.findFirst({ where: { id: expenseId, tenantId } });
  if (!expense) return; // deleted between enqueue and run — nothing to do
  if (expense.confidence != null) return; // already processed (idempotency)

  const bytes = await getObject(expense.storageKey);
  const { extraction, interactionId } = await extractExpenseFromImage(
    toAiImage(bytes, expense.mimeType),
    tenantId,
    expense.createdByUserId,
  );

  const autoPost = extraction.amount != null && extraction.confidence >= AUTO_POST_THRESHOLD;

  await prisma.expense.update({
    where: { id: expense.id }, // tenant-safe: expenseId verified tenant-owned via findFirst above
    data: {
      vendorName: extraction.vendorName,
      amount: extraction.amount,
      currency: extraction.currency,
      expenseDate: extraction.expenseDate ? new Date(extraction.expenseDate) : null,
      gstHead: extraction.gstHead,
      itcEligible: extraction.itcEligible,
      confidence: extraction.confidence,
      aiInteractionId: interactionId,
      status: autoPost ? 'auto_posted' : 'pending_review',
    },
  });

  await writeDomainEvent(prisma, {
    tenantId,
    type: autoPost ? 'expense.auto_posted' : 'expense.needs_review',
    refId: expense.id,
    payload: { amount: extraction.amount, confidence: extraction.confidence, orderId: expense.orderId },
  });
}
