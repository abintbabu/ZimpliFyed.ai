import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { writeDomainEvent } from '@/lib/domain-events';
import { getPack } from '@/packs/registry';
import { buildDocContext, type MissingField } from './context';
import { buildDocModel, type DocModel, type DocType } from './models';
import { runRules, type Finding } from './rules';
import { runAiConsistencyPass } from './ai-consistency';

/** Draft documents carry no real serial (EXPORT_OS_MASTER_PLAN Wave 1) — a number is minted exactly
 * once, at issue (src/lib/doc-engine/issue.ts), never at generation/regeneration time. This
 * placeholder is what a draft's preview PDF/HTML shows in the number's place. */
export const DRAFT_DOC_NUMBER_PLACEHOLDER = 'DRAFT';

/**
 * Doc-set generation flow (DOC_ENGINE_SPEC §1.3, build steps 2–3).
 *
 *   1. Build + validate DocContext → fix-list if incomplete (no partial sets).
 *   2. Build every requested DocModel (pure, from the one context snapshot), unnumbered.
 *   3. Deterministic rule pass over the whole set.
 *   4. AI consistency pass over the same models (meaning-level findings the rules can't reach).
 *   5. Persist DocSet (version++, status 'draft') + one ExportDocument per type, docNumber null,
 *      findings attached.
 *   6. Meter `doc_set` + emit `docset.generated`.
 *
 * This is always a DRAFT — regeneration after an order edit mints a new version and supersedes the
 * previous set, freely, any number of times, without ever allocating a real serial (EXPORT_OS_MASTER_PLAN
 * Wave 1). A number is minted exactly once, in issue order, when a human calls issueDocSet (issue.ts) —
 * see that file for why numbering must never happen here. The DB-touching steps (persist/meter/event)
 * run in one transaction — a half-written set can never exist. The AI pass (a network call) runs AFTER
 * that transaction commits, so a DB connection is never held open across inference, then its findings
 * are written back; if inference fails the set still stands on its deterministic guarantees.
 */

export type GenerateResult =
  | { ok: false; missing: MissingField[] }
  | {
      ok: true;
      docSetId: string;
      version: number;
      models: DocModel[];
      findings: Finding[];
    };

export async function generateDocSet(input: {
  tenantId: string;
  orderId: string;
  userId: string;
  types: DocType[];
  packId?: string;
}): Promise<GenerateResult> {
  const { tenantId, orderId, userId } = input;
  const packId = input.packId ?? 'in';

  // Step 1 — context + fix-list.
  const ctxResult = await buildDocContext(tenantId, orderId);
  if (!ctxResult.ok) return { ok: false, missing: ctxResult.missing };
  const context = ctxResult.context;

  const persisted = await prisma.$transaction(async (tx) => {
    // Version = one past the current highest set for this order; supersede the prior draft/approved set.
    const prior = await tx.docSet.findFirst({
      where: { tenantId, orderId },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    const version = (prior?.version ?? 0) + 1;
    if (prior) {
      await tx.docSet.update({ where: { id: prior.id }, data: { status: 'superseded' } });
    }

    // Steps 2–3 — models + rules. No number is allocated here (Wave 1) — a draft is a free, cheap
    // preview; the real serial is minted exactly once, at issue (issue.ts), inside its own transaction.
    const extras = getPack(packId).resolveDocumentExtras?.(context) ?? {};
    const built: { type: DocType; model: DocModel }[] = input.types.map((type) => ({
      type,
      model: buildDocModel(type, context, DRAFT_DOC_NUMBER_PLACEHOLDER, extras),
    }));
    const findings = runRules(built.map((b) => b.model), packId);

    // Step 5 — persist the set + documents.
    const docSet = await tx.docSet.create({
      data: {
        tenantId,
        orderId,
        version,
        status: 'draft',
        contextSnapshot: context as object,
        ruleFindings: findings as object,
        shareToken: randomBytes(24).toString('base64url'),
        generatedByUserId: userId,
      },
      select: { id: true },
    });

    for (const b of built) {
      const last = await tx.exportDocument.findFirst({
        where: { tenantId, orderId, type: b.type },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const docVersion = (last?.version ?? 0) + 1;
      const docFindings = findings.filter((f) => f.docTypes.includes(b.type));
      await tx.exportDocument.create({
        data: {
          tenantId,
          orderId,
          type: b.type,
          version: docVersion,
          data: b.model as object,
          docSetId: docSet.id,
          docNumber: null, // allocated at issue (issue.ts), never at draft-generation time
          docModel: b.model as object,
          findings: docFindings as object,
          createdByUserId: userId,
        },
      });
    }

    // Step 6 — meter + event.
    await tx.meterEvent.create({ data: { tenantId, kind: 'doc_set', metadata: { orderId, version } } });
    await tx.docSet.update({ where: { id: docSet.id }, data: { meteredAt: new Date() } });
    await writeDomainEvent(tx, { tenantId, type: 'docset.generated', refId: docSet.id, payload: { orderId, version, types: input.types } });

    return {
      docSetId: docSet.id,
      version,
      models: built.map((b) => b.model),
      ruleFindings: findings,
    };
  });

  // Step 4 — AI consistency pass, outside the transaction (best-effort; never blocks the set).
  const aiFindings = await runAiConsistencyPass(persisted.models, tenantId, userId);
  if (aiFindings.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.docSet.update({ where: { id: persisted.docSetId }, data: { aiFindings: aiFindings as object } });
      // Attach each AI finding to every document it names, alongside the rule findings already stored.
      const docs = await tx.exportDocument.findMany({
        where: { docSetId: persisted.docSetId },
        select: { id: true, type: true, findings: true },
      });
      for (const doc of docs) {
        const forDoc = aiFindings.filter((f) => f.docTypes.includes(doc.type as DocType));
        if (forDoc.length === 0) continue;
        const existing = (doc.findings as Finding[] | null) ?? [];
        await tx.exportDocument.update({ where: { id: doc.id }, data: { findings: [...existing, ...forDoc] as object } });
      }
    });
  }

  return {
    ok: true,
    docSetId: persisted.docSetId,
    version: persisted.version,
    models: persisted.models,
    findings: [...persisted.ruleFindings, ...aiFindings],
  };
}
