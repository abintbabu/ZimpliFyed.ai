'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { requireFeature } from '@/lib/billing/entitlements';
import { reviewLcTerms } from '@/lib/ai/lc-advisor';
import { lcTermProblems } from '@/lib/lc-deadlines';
import { buildChecklist, checkPresentation, kindFromFileName, type DocKind, type ChecklistItem, type PresentationCheck } from '@/lib/lc-presentation';
import { extractLcTermsFromText, type LcTerms } from '@/lib/ai/lc-extract';
import type { LcStatus } from '@prisma/client';

export async function listLettersOfCredit(orderId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) throw new Error('You do not have permission to view this');
  return prisma.letterOfCredit.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } });
}

function buildOrderContext(order: {
  orderNumber: string;
  product: string | null;
  quantity: number | null;
  unit: string | null;
  incoterm: string | null;
  destination: string | null;
  originPort: string | null;
  destPort: string | null;
}) {
  return [
    `Order number: ${order.orderNumber}`,
    `Product: ${order.product ?? 'unspecified'}`,
    `Quantity: ${order.quantity ?? 'unspecified'} ${order.unit ?? ''}`.trim(),
    `Incoterm: ${order.incoterm ?? 'unspecified'}`,
    `Origin port: ${order.originPort ?? 'unspecified'}`,
    `Destination port: ${order.destPort ?? 'unspecified'}`,
    `Final destination: ${order.destination ?? 'unspecified'}`,
  ].join('\n');
}

export async function reviewLetterOfCredit(input: {
  orderId: string;
  lcNumber?: string;
  issuingBank?: string;
  rawText: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to review LC terms');
  await requireFeature(tenantId, 'lc_advisor');
  if (!input.rawText.trim()) throw new Error('Paste the draft LC text first');

  const order = await prisma.order.findFirst({ where: { id: input.orderId, tenantId } });
  if (!order) throw new Error('Order not found');

  const { review, interactionId } = await reviewLcTerms(input.rawText, buildOrderContext(order), tenantId, userId);

  const lc = await prisma.letterOfCredit.create({
    data: {
      tenantId,
      orderId: input.orderId,
      lcNumber: input.lcNumber?.trim() || null,
      issuingBank: input.issuingBank?.trim() || null,
      rawText: input.rawText,
      workable: review.workable,
      reviewSummary: review.summary,
      issues: review.issues,
      reviewedAt: new Date(),
      createdByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: input.orderId,
    action: 'create',
    summary: `Reviewed LC for order ${order.orderNumber}: ${review.workable ? 'workable' : 'needs revision'} (${review.issues.length} issue(s))`,
    after: { workable: review.workable, issueCount: review.issues.length },
  });

  revalidatePath(`/dashboard/orders/${input.orderId}`);
  return { ...lc, interactionId };
}

export type LcTermsInput = {
  amount?: number | null;
  currency?: string | null;
  /** ISO dates (YYYY-MM-DD) or empty to clear. */
  expiryDate?: string | null;
  latestShipmentDate?: string | null;
  requiredDocuments?: string[];
  status?: LcStatus;
};

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`"${v}" is not a valid date`);
  return d;
}

/**
 * Saves an LC's structured terms (amount, dates, required documents, status). Term problems (expiry before
 * the latest shipment date, amount below the order value…) are returned as warnings and saved anyway —
 * the bank-issued LC is the source of truth; we flag, we don't refuse to record it.
 */
export async function saveLcTerms(lcId: string, input: LcTermsInput) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to edit LC terms');

  const lc = await prisma.letterOfCredit.findFirst({ where: { id: lcId, tenantId }, include: { order: { include: { lines: true, quote: true } } } });
  if (!lc) throw new Error('Letter of credit not found');

  const amount = input.amount ?? null;
  const currency = input.currency?.trim().toUpperCase() || null;
  const expiryDate = parseDate(input.expiryDate);
  const latestShipmentDate = parseDate(input.latestShipmentDate);
  const requiredDocuments = (input.requiredDocuments ?? []).map((d) => d.trim()).filter(Boolean);

  const orderTotal = lc.order.lines.length
    ? lc.order.lines.reduce((s, l) => s + l.lineTotal, 0)
    : lc.order.quote?.total ?? null;
  const warnings = lcTermProblems(
    { amount, currency, expiryDate, latestShipmentDate },
    { total: orderTotal, currency: lc.order.currency ?? lc.order.quote?.currency ?? null },
  );

  // A moved deadline starts a fresh alert series — clear the "already alerted" watermark.
  const datesMoved =
    expiryDate?.getTime() !== lc.expiryDate?.getTime() || latestShipmentDate?.getTime() !== lc.latestShipmentDate?.getTime();

  await prisma.letterOfCredit.update({
    where: { id: lcId, tenantId },
    data: {
      amount,
      currency,
      expiryDate,
      latestShipmentDate,
      requiredDocuments,
      ...(input.status ? { status: input.status } : {}),
      ...(datesMoved ? { lastAlertedAt: null } : {}),
    },
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: lc.orderId,
    action: 'update',
    summary: `Updated LC terms${lc.lcNumber ? ` (${lc.lcNumber})` : ''}${input.status ? ` — status ${input.status}` : ''}`,
    after: { amount, currency, expiryDate: input.expiryDate ?? null, latestShipmentDate: input.latestShipmentDate ?? null, status: input.status },
  });

  revalidatePath(`/dashboard/orders/${lc.orderId}`);
  return { warnings };
}

/** Records an LC without an AI review — for when the exporter just needs the dates tracked. */
export async function addLetterOfCredit(input: { orderId: string; lcNumber?: string; issuingBank?: string; rawText?: string }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to add an LC');

  const order = await prisma.order.findFirst({ where: { id: input.orderId, tenantId } });
  if (!order) throw new Error('Order not found');

  const lc = await prisma.letterOfCredit.create({
    data: {
      tenantId,
      orderId: input.orderId,
      lcNumber: input.lcNumber?.trim() || null,
      issuingBank: input.issuingBank?.trim() || null,
      rawText: input.rawText ?? '',
      createdByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'orders',
    documentId: input.orderId,
    action: 'create',
    summary: `Recorded LC${lc.lcNumber ? ` ${lc.lcNumber}` : ''} for order ${order.orderNumber}`,
    after: { lcNumber: lc.lcNumber, issuingBank: lc.issuingBank },
  });

  revalidatePath(`/dashboard/orders/${input.orderId}`);
  return lc;
}

/**
 * Mechanical pre-check of the document set against the LC: required documents present, shipped in time,
 * inside the presentation window, invoice within the LC amount and currency. Read-only and advisory — the
 * bank decides. "Present" means a document we can see: an issued set document, a recorded B/L number, a
 * certificate on the compliance register for this order, or an upload whose file name says what it is.
 */
export async function getLcPresentationCheck(lcId: string): Promise<{ checklist: ChecklistItem[]; check: PresentationCheck } | { unavailable: string }> {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) return { unavailable: 'You do not have access to orders.' };

  const lc = await prisma.letterOfCredit.findFirst({ where: { id: lcId, tenantId }, include: { order: { include: { invoices: true, exportDocuments: true, shipmentOrders: { include: { shipment: true } } } } } });
  if (!lc) return { unavailable: 'Letter of credit not found.' };
  const order = lc.order;

  const available = new Set<DocKind>();
  for (const d of order.exportDocuments) {
    if (!d.docNumber || d.cancelledAt) continue;
    if (d.type === 'commercial_invoice') available.add('commercial_invoice');
    if (d.type === 'packing_list') available.add('packing_list');
    if (d.type === 'certificate_of_origin') available.add('certificate_of_origin');
    if (d.type === 'proforma_invoice') available.add('proforma_invoice');
  }
  const shipments = order.shipmentOrders.map((so) => so.shipment);
  for (const sh of shipments) if (sh.blNumber) available.add(sh.mode === 'air' ? 'airway_bill' : 'bill_of_lading');

  const [certs, uploads] = await Promise.all([
    prisma.complianceItem.findMany({ where: { tenantId, orderId: order.id }, select: { category: true } }),
    prisma.document.findMany({ where: { tenantId, OR: [{ collection: 'orders', documentId: order.id }, { collection: 'shipments', documentId: { in: shipments.map((s) => s.id) } }] }, select: { fileName: true } }),
  ]);
  const certKind: Record<string, DocKind> = { coo: 'certificate_of_origin', phytosanitary: 'phytosanitary_certificate', fumigation: 'fumigation_certificate', inspection: 'inspection_certificate' };
  for (const c of certs) if (certKind[c.category]) available.add(certKind[c.category]);
  for (const u of uploads) { const k = kindFromFileName(u.fileName); if (k) available.add(k); }

  const required = Array.isArray(lc.requiredDocuments) ? (lc.requiredDocuments as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const checklist = buildChecklist(required, available);

  const shipDates = shipments.map((s) => s.blDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  const live = order.invoices.filter((i) => !i.isCreditOrDebitNote && i.status !== 'draft' && i.status !== 'void');
  const check = checkPresentation({
    lc: { amount: lc.amount, currency: lc.currency, expiryDate: lc.expiryDate, latestShipmentDate: lc.latestShipmentDate, status: lc.status },
    // The LAST shipment date is the one that must beat the LC's latest-shipment date.
    shipmentDate: shipDates.length ? shipDates[shipDates.length - 1] : null,
    invoiceTotal: live.length ? live.reduce((s, i) => s + i.total, 0) : null,
    invoiceCurrency: live[0]?.currency ?? null,
    checklist, now: new Date(),
  });
  return { checklist, check };
}

/** Proposes structured terms from the LC's pasted text. Nothing is saved — the terms form is pre-filled for review. */
export async function proposeLcTerms(lcId: string): Promise<{ terms: LcTerms } | { unavailable: string }> {
  const { tenantId, role, userId } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) return { unavailable: 'You do not have permission to edit LC terms.' };
  await requireFeature(tenantId, 'lc_advisor');
  const lc = await prisma.letterOfCredit.findFirst({ where: { id: lcId, tenantId }, select: { rawText: true } });
  if (!lc) return { unavailable: 'Letter of credit not found.' };
  if (!lc.rawText.trim()) return { unavailable: 'This LC has no pasted text to read — paste the LC text when adding it.' };
  const { terms } = await extractLcTermsFromText(lc.rawText, tenantId, userId);
  return { terms };
}
