'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { requireFeature } from '@/lib/billing/entitlements';
import { generateDocSet } from '@/lib/doc-engine/generate';
import { ALL_DOC_TYPES, type DocModel, type DocType } from '@/lib/doc-engine/models';
import type { Finding } from '@/lib/doc-engine/rules';

/** Generate (or regenerate) the cross-validated doc-set for an order. Returns a fix-list when the order is
 * missing required fields — that is the UX, not an error (DOC_ENGINE_SPEC §1.1). */
export async function generateDocSetAction(orderId: string, types: DocType[] = ALL_DOC_TYPES) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to generate documents');
  await requireFeature(tenantId, 'doc_generator');

  const result = await generateDocSet({ tenantId, orderId, userId, types });

  if (result.ok) {
    const errors = result.findings.filter((f) => f.severity === 'error').length;
    await writeAudit({
      session,
      collection: 'doc_sets',
      documentId: result.docSetId,
      action: 'create',
      summary: `Generated doc-set v${result.version} (${types.length} documents, ${errors} issue(s))`,
      after: { version: result.version, types },
    });
    revalidatePath(`/dashboard/orders/${orderId}`);
  }

  return result;
}

/** The latest (highest-version) doc-set for an order, with its rendered document models and merged findings,
 * for the order-page review panel. Returns null when nothing has been generated yet. */
export async function getOrderDocSet(orderId: string): Promise<{
  id: string;
  version: number;
  status: string;
  shareToken: string | null;
  expiresAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
  findings: Finding[];
  documents: { id: string; type: DocType; docNumber: string | null; model: DocModel | null; findings: Finding[] }[];
} | null> {
  const { tenantId } = await requireTenantSession();
  const docSet = await prisma.docSet.findFirst({
    where: { tenantId, orderId },
    orderBy: { version: 'desc' },
    include: { documents: { orderBy: { type: 'asc' } } },
  });
  if (!docSet) return null;

  const ruleFindings = (docSet.ruleFindings as Finding[] | null) ?? [];
  const aiFindings = (docSet.aiFindings as Finding[] | null) ?? [];

  return {
    id: docSet.id,
    version: docSet.version,
    status: docSet.status,
    shareToken: docSet.shareToken,
    expiresAt: docSet.expiresAt,
    approvedAt: docSet.approvedAt,
    createdAt: docSet.createdAt,
    findings: [...ruleFindings, ...aiFindings],
    documents: docSet.documents.map((d) => ({
      id: d.id,
      type: d.type as DocType,
      docNumber: d.docNumber,
      model: (d.docModel as unknown as DocModel) ?? null,
      findings: (d.findings as Finding[] | null) ?? [],
    })),
  };
}

/** Approve a draft doc-set: locks it and stamps status. */
export async function approveDocSetAction(docSetId: string) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to approve documents');

  const docSet = await prisma.docSet.findFirst({ where: { id: docSetId, tenantId } });
  if (!docSet) throw new Error('Doc-set not found');
  const findings = (docSet.ruleFindings as Finding[] | null) ?? [];
  if (findings.some((f) => f.severity === 'error')) {
    throw new Error('Resolve the blocking issues before approving this document set');
  }

  await prisma.docSet.update({ where: { id: docSetId }, data: { status: 'approved', approvedAt: new Date() } }); // tenant-safe: docSetId verified tenant-owned via findFirst above
  await writeAudit({ session, collection: 'doc_sets', documentId: docSetId, action: 'update', summary: `Approved doc-set v${docSet.version}` });
  revalidatePath(`/dashboard/orders/${docSet.orderId}`);
}

export async function revokeDocSetShareLink(docSetId: string) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to revoke this link');
  const docSet = await prisma.docSet.findFirst({ where: { id: docSetId, tenantId } });
  if (!docSet) throw new Error('Doc-set not found');
  await prisma.docSet.update({ where: { id: docSetId }, data: { shareToken: null, expiresAt: null } }); // tenant-safe: docSetId verified tenant-owned via findFirst above
  revalidatePath(`/dashboard/orders/${docSet.orderId}`);
}

/** Buyer/CHA-facing, unauthenticated. The doc-set IS the deliverable, so it returns the rendered document
 * models — but never the internal rule/AI findings or cost data. */
export async function getDocSetByShareToken(token: string): Promise<{
  version: number;
  status: string;
  documents: { type: DocType; docNumber: string | null; model: DocModel }[];
} | null> {
  const docSet = await prisma.docSet.findUnique({ // tenant-safe: buyer-facing public share-token lookup, intentionally cross-tenant; returns only the finished documents
    where: { shareToken: token },
    include: { documents: { orderBy: { type: 'asc' } } },
  });
  if (!docSet) return null;
  if (docSet.expiresAt && docSet.expiresAt < new Date()) return null;

  return {
    version: docSet.version,
    status: docSet.status,
    documents: docSet.documents
      .filter((d) => d.docModel)
      .map((d) => ({ type: d.type as DocType, docNumber: d.docNumber, model: d.docModel as unknown as DocModel })),
  };
}
