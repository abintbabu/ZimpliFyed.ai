import fs from 'node:fs/promises';
import { ingestSource } from '../src/ai/corpus';

/**
 * Manual curation queue v1 (AI_PLATFORM_SPEC §4, §7): a human pastes/exports a source doc (FTA text, duty
 * schedule, DGFT circular, port procedure) to a file and runs this to chunk + embed + upsert it into the
 * KnowledgeChunk corpus. No scraping/automation yet — a domain-expert hire reviewing a real ingestion queue is
 * future scope; this just gets the storage + retrieval + citation path working end to end.
 *
 * Usage: npm run ingest:corpus -- --pack in --source "dgft-circular-12-2026" --title "DGFT Circular 12/2026 — RoDTEP rate revision" --file ./corpus/dgft-12-2026.md
 */

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key) args[key] = argv[i + 1] ?? '';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { pack, source, title, file } = args;

  if (!pack || !source || !title || !file) {
    console.error('Usage: npm run ingest:corpus -- --pack <packId> --source <sourceRef> --title <title> --file <path>');
    process.exit(1);
  }

  const text = await fs.readFile(file, 'utf-8');
  const { chunkCount } = await ingestSource({ packId: pack, sourceRef: source, title, text });
  console.log(`Ingested "${title}" (${source}) into pack "${pack}": ${chunkCount} chunk(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
