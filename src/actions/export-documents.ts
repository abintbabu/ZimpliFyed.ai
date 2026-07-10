'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { writeDomainEvent } from '@/lib/domain-events';
import { requireFeature } from '@/lib/billing/entitlements';
import { buildExportDocumentData, EXPORT_DOCUMENT_LABELS, type ExportDocumentData } from '@/lib/export-documents';
import { checkDocumentConsistency } from '@/lib/ai/document-consistency';
import type { ExportDocumentType } from '@prisma/client';

export async function listExportDocuments(tenantId: string, orderId: string) {
  const docs = await prisma.exportDocument.findMany({
    where: { tenantId, orderId },
    orderBy: [{ type: 'asc' }, { version: 'desc' }],
  });
  return docs as (typeof docs[number] & { data: ExportDocumentData })[];
}

export async function generateExportDocument(input: {
  orderId: string;
  type: ExportDocumentType;
  buyerName: string;
  buyerAddress: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to generate documents');
  await requireFeature(tenantId, 'doc_generator');
  if (!input.buyerName.trim()) throw new Error('Buyer name is required');

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, tenantId },
    include: { quote: { include: { lines: true } }, invoices: { include: { lines: true } } },
  });
  if (!order) throw new Error('Order not found');

  const invoice = order.invoices[0];
  const sourceLines = invoice?.lines ?? order.quote?.lines ?? [];
  if (sourceLines.length === 0) {
    throw new Error('This order has no quote or invoice line items to generate a document from');
  }

  const data = buildExportDocumentData({
    order,
    buyerName: input.buyerName.trim(),
    buyerAddress: input.buyerAddress.trim(),
    currency: invoice?.currency ?? order.quote?.currency ?? 'USD',
    lines: sourceLines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
  });

  const last = await prisma.exportDocument.findFirst({
    where: { tenantId, orderId: input.orderId, type: input.type },
    orderBy: { version: 'desc' },
  });
  const version = (last?.version ?? 0) + 1;

  const doc = await prisma.exportDocument.create({
    data: {
      tenantId,
      orderId: input.orderId,
      type: input.type,
      version,
      data,
      createdByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'export_documents',
    documentId: doc.id,
    action: 'create',
    summary: `Generated ${EXPORT_DOCUMENT_LABELS[input.type]} v${version} for order ${order.orderNumber}`,
    after: { type: input.type, version },
  });
  await writeDomainEvent(prisma, { tenantId, type: 'docset.generated', refId: doc.id, payload: { type: input.type, version, orderId: input.orderId } });

  revalidatePath(`/dashboard/orders/${input.orderId}`);
  return doc;
}

export async function runDocumentConsistencyCheck(orderId: string) {
  const session = await requireTenantSession();
  const { tenantId, userId } = session;
  if (!hasPermission(session.role, 'orders:read')) throw new Error('You do not have permission to view this order');

  const docs = await listExportDocuments(tenantId, orderId);
  const latestByType = new Map<ExportDocumentType, (typeof docs)[number]>();
  for (const d of docs) {
    if (!latestByType.has(d.type)) latestByType.set(d.type, d);
  }
  const latest = Array.from(latestByType.values());
  if (latest.length < 2) {
    throw new Error('Generate at least two document types before running a consistency check');
  }

  const { result, interactionId } = await checkDocumentConsistency(
    latest.map((d) => ({ type: d.type, version: d.version, data: d.data })),
    tenantId,
    userId,
  );

  await writeAudit({
    session,
    collection: 'export_documents',
    documentId: orderId,
    action: 'update',
    summary: result.consistent
      ? 'AI consistency check: no discrepancies found'
      : `AI consistency check found ${result.issues.length} issue(s)`,
    metadata: { issues: result.issues },
  });

  return { ...result, interactionId };
}
