'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
import { extractEnquiry } from '@/lib/ai/enquiry-extraction';
import {
  withDefaultExpenseMargin,
  DEFAULT_EXPENSE_PCT,
  DEFAULT_MARGIN_PCT,
} from '@/lib/pricing-buildup';

export type EnquiryDraftResult = {
  quoteId: string;
  quoteNumber: string;
  buyerId: string;
  buyerName: string;
  leadId: string;
  product: string;
  quantity: number;
  unitPrice: number;
  marginPct: number;
  currency: string;
  /** True when the buyer gave no target price, so the line is seeded from cost + default margin instead. */
  priceAssumed: boolean;
};

/**
 * The onboarding aha (Sprint 5): paste a raw buyer enquiry → one AI extract → dedupe/create the Buyer + Lead
 * → seed a DRAFT quote with a visible margin. Everything downstream (cost sheet, PDF, buyer share link) is
 * the existing quote flow. Runs the whole chain in a single call so the UI can offer it as one tap.
 *
 * Margin note: an enquiry never carries the exporter's cost, so the seed line uses the same DEFAULT_MARGIN_PCT
 * the rest of the quote engine assumes when a margin isn't specified — the founder then edits cost/price in the
 * normal quote editor. When the buyer states a target price we honour it as the unit price; otherwise the line
 * starts at zero and the margin is the default assumption (priceAssumed=true).
 */
export async function draftQuoteFromEnquiry(rawText: string): Promise<EnquiryDraftResult> {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'quotes:write')) throw new Error('You do not have permission to create quotes');
  if (!rawText.trim()) throw new Error('Paste the buyer enquiry first');

  // No plan-feature gate: this is the activation moment, available on the free trial. runAi still enforces the
  // tenant's AI-action budget, so it can't be abused for unlimited free inference.
  const { enquiry, interactionId } = await extractEnquiry(rawText.trim(), tenantId, userId);
  const buyerName = enquiry.buyer.name.trim() || 'Unknown buyer';

  const result = await prisma.$transaction(async (tx) => {
    // Dedupe the buyer on name within the tenant (case-insensitive) — never spawn a duplicate on re-paste.
    const existingBuyer = await tx.buyer.findFirst({
      where: { tenantId, name: { equals: buyerName, mode: 'insensitive' } },
      select: { id: true, currencyDefault: true },
    });
    const buyer =
      existingBuyer ??
      (await tx.buyer.create({
        data: {
          tenantId,
          name: buyerName,
          country: enquiry.buyer.country,
          source: 'inquiry',
          contacts:
            enquiry.buyer.email || enquiry.buyer.phone || enquiry.buyer.contactName
              ? { create: [{ name: enquiry.buyer.contactName ?? buyerName, email: enquiry.buyer.email, phone: enquiry.buyer.phone, isPrimary: true }] }
              : undefined,
        },
        select: { id: true, currencyDefault: true },
      }));

    // A Lead captures the enquiry in the pipeline and links to the buyer.
    const lead = await tx.lead.create({
      data: {
        tenantId,
        source: 'inquiry',
        name: enquiry.buyer.contactName ?? buyerName,
        company: buyerName,
        email: enquiry.buyer.email,
        phone: enquiry.buyer.phone,
        country: enquiry.buyer.country,
        itemsInterested: enquiry.product,
        stage: 'Quoted_Invoice',
        convertedBuyerId: buyer.id,
      },
      select: { id: true },
    });

    // Seed a single draft quote line. Target price → unit price when given; otherwise start at zero.
    const currency = enquiry.targetPriceCurrency ?? buyer.currencyDefault ?? 'USD';
    const quantity = enquiry.quantity && enquiry.quantity > 0 ? enquiry.quantity : 1;
    const unitPrice = enquiry.targetPrice ?? 0;
    const priceAssumed = enquiry.targetPrice == null;
    const description = enquiry.specs ? `${enquiry.product} — ${enquiry.specs}` : enquiry.product;

    const [line] = withDefaultExpenseMargin([
      { description, quantity, cost: 0, unitPrice, expensePct: DEFAULT_EXPENSE_PCT, marginPct: DEFAULT_MARGIN_PCT, lineTotal: parseFloat((quantity * unitPrice).toFixed(2)) },
    ]);

    const count = await tx.quote.count({ where: { tenantId } });
    const quoteNumber = `Q-${1001 + count}`;

    const quote = await tx.quote.create({
      data: {
        tenantId,
        quoteNumber,
        leadId: lead.id,
        buyerId: buyer.id,
        currency,
        total: line.lineTotal,
        overallMarginPct: DEFAULT_MARGIN_PCT,
        lines: { create: [{ description: line.description, quantity: line.quantity, cost: line.cost, expensePct: line.expensePct, marginPct: line.marginPct, unitPrice: line.unitPrice, lineTotal: line.lineTotal }] },
      },
      select: { id: true, quoteNumber: true },
    });

    await writeDomainEvent(tx, { tenantId, type: 'enquiry.quoted', refId: quote.id, payload: { buyerId: buyer.id, leadId: lead.id, interactionId } });

    return {
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      buyerId: buyer.id,
      leadId: lead.id,
      currency,
      quantity,
      unitPrice,
      priceAssumed,
      product: enquiry.product,
    };
  });

  await writeAudit({
    session,
    collection: 'quotes',
    documentId: result.quoteId,
    action: 'create',
    summary: `Drafted quote ${result.quoteNumber} from a pasted buyer enquiry (${buyerName})`,
    after: { buyerName, product: result.product },
  });

  revalidatePath('/dashboard/quotes');
  revalidatePath('/dashboard/leads');

  return {
    ...result,
    buyerName,
    marginPct: DEFAULT_MARGIN_PCT,
  };
}
