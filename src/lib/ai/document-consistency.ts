import 'server-only';
import { z } from 'zod';
import { runAi } from '@/ai/router';
import { EXPORT_DOCUMENT_LABELS, type ExportDocumentData } from '@/lib/export-documents';
import type { ExportDocumentType } from '@prisma/client';

const ConsistencyResultSchema = z.object({
  consistent: z.boolean().describe('true if no discrepancies were found across the documents'),
  issues: z.array(
    z.object({
      description: z.string().describe('Plain-language description of the discrepancy and which documents it appears between'),
      severity: z.enum(['low', 'medium', 'high']).describe('high = likely to cause a customs hold or LC rejection'),
    }),
  ),
});

export type ConsistencyResult = z.infer<typeof ConsistencyResultSchema>;

export async function checkDocumentConsistency(
  documents: { type: ExportDocumentType; version: number; data: ExportDocumentData }[],
  tenantId: string,
  userId?: string,
) {
  const payload = documents
    .map((d) => `## ${EXPORT_DOCUMENT_LABELS[d.type]} (v${d.version})\n${JSON.stringify(d.data, null, 2)}`)
    .join('\n\n');

  const result = await runAi({
    flowId: 'document_consistency',
    tier: 'reason',
    tenantId,
    userId,
    input: payload,
    schema: ConsistencyResultSchema,
    maxTokens: 1024,
  });

  return { result: result.output, interactionId: result.interactionId };
}
