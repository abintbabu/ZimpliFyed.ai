import 'server-only';
import { prisma } from '@/lib/prisma';
import { writeDomainEvent } from '@/lib/domain-events';
import { writeAudit } from '@/lib/audit';
import { getPack } from '@/packs/registry';
import type { TenantSession } from '@/lib/session-tenant';
import type { DocContext } from './context';
import { buildDocModel, type DocType } from './models';
import { issueDocNumber } from './numbering';

/**
 * The issue-transaction (EXPORT_OS_MASTER_PLAN §15 Wave 1, §13.1). Everything generateDocSet
 * (generate.ts) builds is a draft — freely regeneratable, no serial consumed. This file is the ONLY
 * place a real document number is minted, and it happens exactly once per ExportDocument, inside one
 * transaction with the DocSet's draft→approved flip, so serial order can never diverge from issue
 * order.
 *
 * Post-issue immutability is structural, not a runtime guard: there is no generic `update()` path for
 * an issued ExportDocument anywhere in the app. The only way to change an issued document's content
 * is to regenerate (a new draft version, via generate.ts) and issue that — which this file detects
 * and records as an amendment (`amend_issued`), not a plain issue.
 */

export type IssueResult =
  | { ok: true; docSetId: string; documents: { type: DocType; docNumber: string; overLength: boolean }[] }
  | { ok: false; error: string };

export async function issueDocSet(input: {
  tenantId: string;
  docSetId: string;
  userId: string;
  role: TenantSession['role'];
  packId?: string;
}): Promise<IssueResult> {
  const { tenantId, docSetId, userId, role } = input;
  const packId = input.packId ?? 'in';
  const session: TenantSession = { tenantId, userId, role };

  return prisma.$transaction(async (tx) => {
    const docSet = await tx.docSet.findFirst({
      where: { id: docSetId, tenantId },
      include: { documents: true },
    });
    if (!docSet) return { ok: false, error: 'Doc set not found' };
    if (docSet.status !== 'draft') {
      return { ok: false, error: `Doc set is already ${docSet.status} — regenerate to create a new draft before issuing again` };
    }

    const context = docSet.contextSnapshot as unknown as DocContext; // immutable since generation
    const extras = getPack(packId).resolveDocumentExtras?.(context) ?? {};

    const issued: { type: DocType; docNumber: string; overLength: boolean }[] = [];

    for (const doc of docSet.documents) {
      const type = doc.type as DocType;

      // A prior ISSUED version of this same order+type, if any — detected BEFORE this row is updated,
      // since regenerating-then-reissuing after a prior issue IS the amendment (no separate "edit").
      const priorIssued = await tx.exportDocument.findFirst({
        where: { tenantId, orderId: doc.orderId, type, docNumber: { not: null }, id: { not: doc.id } },
        orderBy: { version: 'desc' },
        select: { docNumber: true, version: true },
      });

      const { docNumber, overLength } = await issueDocNumber(tx, tenantId, type, packId);
      const model = buildDocModel(type, context, docNumber, extras);

      await tx.exportDocument.update({
        where: { id: doc.id },
        data: { docNumber, docModel: model as object, data: model as object },
      });

      await writeAudit({
        tx,
        session,
        collection: 'ExportDocument',
        documentId: doc.id,
        action: 'issue',
        summary: `${type} issued as ${docNumber}`,
        after: { docNumber, version: doc.version },
      });

      if (priorIssued) {
        await writeAudit({
          tx,
          session,
          collection: 'ExportDocument',
          documentId: doc.id,
          action: 'amend_issued',
          summary: `${type} amended: ${priorIssued.docNumber} (v${priorIssued.version}) superseded by ${docNumber} (v${doc.version})`,
          before: { docNumber: priorIssued.docNumber, version: priorIssued.version },
          after: { docNumber, version: doc.version },
        });
      }

      issued.push({ type, docNumber, overLength });
    }

    await tx.docSet.update({
      where: { id: docSetId },
      data: { status: 'approved', approvedAt: new Date(), approvedByUserId: userId },
    });

    await writeDomainEvent(tx, {
      tenantId,
      type: 'docset.issued',
      refId: docSetId,
      payload: { orderId: docSet.orderId, documents: issued },
    });

    return { ok: true, docSetId, documents: issued };
  });
}

export type CancelResult = { ok: true } | { ok: false; error: string };

/**
 * Cancels an already-issued document. The number is never touched — it stays on the row, retained
 * forever, never reused. "Nil value" for any future filing-pack export (Wave 7) is derived at read
 * time from `cancelledAt != null`, not stored as a separate flag.
 */
export async function cancelExportDocument(input: {
  tenantId: string;
  exportDocumentId: string;
  userId: string;
  role: TenantSession['role'];
  reason: string;
}): Promise<CancelResult> {
  const { tenantId, exportDocumentId, userId, role, reason } = input;
  const session: TenantSession = { tenantId, userId, role };

  return prisma.$transaction(async (tx) => {
    const doc = await tx.exportDocument.findFirst({ where: { id: exportDocumentId, tenantId } });
    if (!doc) return { ok: false, error: 'Document not found' };
    if (!doc.docNumber) return { ok: false, error: 'Cannot cancel a draft — it was never issued' };
    if (doc.cancelledAt) return { ok: false, error: 'Document is already cancelled' };

    await tx.exportDocument.update({
      where: { id: doc.id },
      data: { cancelledAt: new Date(), cancelledReason: reason, cancelledByUserId: userId },
    });

    await writeAudit({
      tx,
      session,
      collection: 'ExportDocument',
      documentId: doc.id,
      action: 'cancel',
      summary: `${doc.type} ${doc.docNumber} cancelled — number retained, reported at nil value`,
      before: { cancelledAt: null },
      after: { cancelledAt: new Date().toISOString(), reason },
    });

    return { ok: true };
  });
}
