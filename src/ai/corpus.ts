import 'server-only';
import { prisma } from '@/lib/prisma';
import { embedText } from './embeddings';

const MAX_CHUNK_CHARS = 1500;

/** Splits on blank-line paragraph boundaries, packing paragraphs up to ~MAX_CHUNK_CHARS per chunk so citations
 * stay reasonably granular without splitting mid-thought. Good enough for the manual-curation v1 (AI_PLATFORM_SPEC §4);
 * revisit if a source needs structure-aware chunking (tables, clause numbering). */
export function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const p of paragraphs) {
    if (current && (current.length + p.length + 2) > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Ingests one source document: chunks, embeds, and inserts as new KnowledgeChunk rows, superseding any prior
 * chunks from the same sourceRef (effectiveFrom/supersededAt gives point-in-time correctness for corpus updates —
 * e.g. a duty schedule revision shouldn't silently rewrite history for citations already shown to users). */
export async function ingestSource(input: { packId: string; sourceRef: string; title: string; text: string }): Promise<{ chunkCount: number }> {
  const chunks = chunkText(input.text);
  const now = new Date();

  await prisma.$executeRaw`UPDATE "KnowledgeChunk" SET "supersededAt" = ${now} WHERE "sourceRef" = ${input.sourceRef} AND "supersededAt" IS NULL`;

  for (const chunk of chunks) {
    const embedding = await embedText(chunk, 'RETRIEVAL_DOCUMENT');
    const vectorLiteral = `[${embedding.join(',')}]`;
    await prisma.$executeRaw`
      INSERT INTO "KnowledgeChunk" (id, "packId", "sourceRef", title, text, embedding, "effectiveFrom", "createdAt")
      VALUES (gen_random_uuid()::text, ${input.packId}, ${input.sourceRef}, ${input.title}, ${chunk}, ${vectorLiteral}::vector, ${now}, ${now})
    `;
  }

  return { chunkCount: chunks.length };
}

export type KnowledgeSearchResult = { title: string; sourceRef: string; text: string; similarity: number };

/** Cosine-similarity search over the live (non-superseded) corpus for a pack, used by Copilot's
 * `search_trade_knowledge` retrieval tool. Every hit carries `sourceRef` for the citation chip. */
export async function searchKnowledge(packId: string, query: string, limit = 5): Promise<KnowledgeSearchResult[]> {
  const embedding = await embedText(query, 'RETRIEVAL_QUERY');
  const vectorLiteral = `[${embedding.join(',')}]`;

  return prisma.$queryRaw<KnowledgeSearchResult[]>`
    SELECT title, "sourceRef", text, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "KnowledgeChunk"
    WHERE "packId" = ${packId} AND "supersededAt" IS NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
}
