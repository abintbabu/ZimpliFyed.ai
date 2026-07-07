import 'server-only';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from './anthropic';
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

const SYSTEM_PROMPT = `You review a set of export shipment documents (proforma invoice, commercial invoice, packing list, certificate of origin) for cross-document consistency. Buyer name/address, total quantities, unit prices, line totals, and Incoterm should match across all documents that include them. Flag any mismatch you find — this is the #1 cause of customs holds and LC rejections in real exports. If a field is simply absent from one document type (e.g. certificate of origin has no pricing), that is not a discrepancy. Only flag genuine contradictions between documents that both state a value.`;

export async function checkDocumentConsistency(
  documents: { type: ExportDocumentType; version: number; data: ExportDocumentData }[],
): Promise<ConsistencyResult> {
  const payload = documents
    .map((d) => `## ${EXPORT_DOCUMENT_LABELS[d.type]} (v${d.version})\n${JSON.stringify(d.data, null, 2)}`)
    .join('\n\n');

  const response = await anthropic.messages.parse({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: payload }],
    output_config: {
      format: zodOutputFormat(ConsistencyResultSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error('Could not evaluate document consistency');
  }

  return response.parsed_output;
}
