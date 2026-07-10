import 'server-only';

const EMBEDDING_MODEL = 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = 768;

/** Gemini embeddings — used for the trade-knowledge corpus (AI_PLATFORM_SPEC §4). Requires GEMINI_API_KEY;
 * there's no Anthropic embeddings API, so this is the one place the router's Anthropic-first rule doesn't apply. */
export async function embedText(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required for corpus embeddings (get a free-tier key at aistudio.google.com/apikey)');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini embedding request failed (${res.status})`);
  }
  const json = await res.json();
  return json.embedding.values as number[];
}
