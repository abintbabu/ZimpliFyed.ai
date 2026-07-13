import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';
import type { DocModel, DocType } from './models';
import { DOC_TITLE } from './models';
import type { Finding } from './rules';

/**
 * AI consistency pass (DOC_ENGINE_SPEC §3, build step 4).
 *
 * Runs AFTER the deterministic rule engine, over the same DocModel[] the rules saw. Rules catch arithmetic
 * and exact-identity issues; this pass catches meaning-level ones they can't — description mismatches,
 * order-of-magnitude-suspicious values, docs the destination typically requires but that are missing.
 *
 * The AI NEVER edits documents — it only files findings (with an optional suggestion a human can accept).
 * It is best-effort: a model/provider failure returns zero AI findings and never blocks generation, so a
 * doc-set always ships with its deterministic guarantees intact even when inference is down.
 */

const AiFindingSchema = z.object({
  docTypes: z
    .array(z.enum(['proforma_invoice', 'commercial_invoice', 'packing_list', 'certificate_of_origin']))
    .min(1)
    .describe('The document type ids this finding spans'),
  severity: z.enum(['error', 'warning']).describe('error = likely customs hold / LC rejection; warning = worth a glance'),
  message: z.string().describe('Plain-language description of the discrepancy'),
  field: z.string().optional().describe('Field path when nameable, e.g. commercial_invoice.body.lines[0].description'),
  suggestion: z.string().optional().describe('A concrete correction the human could accept'),
});

const ConsistencySchema = z.object({
  findings: z.array(AiFindingSchema),
});

/** Serialize the set the way the prompt expects: one titled JSON block per document. */
function buildPayload(models: DocModel[]): string {
  return models
    .map((m) => `## ${DOC_TITLE[m.type]} (${m.type}) — ${m.docNumber}\n${JSON.stringify(m, null, 2)}`)
    .join('\n\n');
}

export async function runAiConsistencyPass(
  models: DocModel[],
  tenantId: string,
  userId?: string,
): Promise<Finding[]> {
  // A single document can't be inconsistent with anything — skip the call (and its cost) entirely.
  if (models.length < 2) return [];

  try {
    const result = await runAi({
      flowId: 'document_consistency',
      promptVersion: 'v2',
      tier: 'reason',
      tenantId,
      userId,
      input: buildPayload(models),
      schema: ConsistencySchema,
      maxTokens: 1536,
    });

    const present = new Set<DocType>(models.map((m) => m.type));
    return result.output.findings
      // Drop any finding the model hallucinated onto a doc type not in this set.
      .filter((f) => f.docTypes.every((t) => present.has(t)))
      .map((f) => ({
        ruleId: 'ai_consistency',
        severity: f.severity,
        docTypes: f.docTypes,
        message: f.message,
        field: f.field,
        suggestion: f.suggestion,
        source: 'ai' as const,
      }));
  } catch {
    // Inference failed — the deterministic guarantees still hold, so ship the set without AI findings.
    return [];
  }
}
