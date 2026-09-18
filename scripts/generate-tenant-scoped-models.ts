import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * EXPORT_OS_MASTER_PLAN §5.2 — walks prisma/schema.prisma's `model { ... }` blocks (block-aware,
 * not a diff-line regex like scripts/check-schema-safety.ts) and emits the list of models that
 * carry a direct `tenantId String` field to src/lib/tenant-scope.generated.ts.
 *
 * That generated Set drives two things: the Prisma extension in src/lib/tenant-scope.ts (which
 * models get tenant-scope enforcement) and the live isolation test (which models get iterated).
 * A model with a `tenantId` field that isn't in this list is a live tenant-isolation gap, so
 * src/tests/security/tenant-scoped-models-sync.test.ts fails CI if this file is stale.
 *
 * Deliberately excludes pure child rows that inherit scope through a parent relation instead of
 * carrying their own tenantId (TermsClause, NumberingCounter, QuoteLineItem, ...) — see the
 * nested-write limitation documented in src/lib/tenant-scope.ts.
 *
 * Run: npx tsx scripts/generate-tenant-scoped-models.ts
 */

const SCHEMA_PATH = path.join(__dirname, "..", "prisma", "schema.prisma");
const OUT_PATH = path.join(__dirname, "..", "src", "lib", "tenant-scope.generated.ts");

function extractModelBlocks(schema: string): { name: string; body: string }[] {
  const blocks: { name: string; body: string }[] = [];
  const modelStart = /^model\s+(\w+)\s*\{/gm;
  let match: RegExpExecArray | null;

  while ((match = modelStart.exec(schema))) {
    const name = match[1];
    let depth = 1;
    let i = match.index + match[0].length;
    const bodyStart = i;
    while (depth > 0 && i < schema.length) {
      if (schema[i] === "{") depth++;
      else if (schema[i] === "}") depth--;
      i++;
    }
    if (depth !== 0) {
      throw new Error(`generate-tenant-scoped-models: unbalanced braces reading model ${name}`);
    }
    blocks.push({ name, body: schema.slice(bodyStart, i - 1) });
    modelStart.lastIndex = i;
  }
  return blocks;
}

function hasDirectTenantIdField(body: string): boolean {
  // A direct, REQUIRED scalar field declaration, e.g. `tenantId String` or `tenantId String @unique`
  // — not a reference inside a relation's `fields: [...]`/`@@index`/`@@unique` attribute, a comment,
  // or a nullable `tenantId String?` (PlatformAuditEntry stores tenantId as denormalized audit
  // metadata with no Tenant relation — it is deliberately platform-scoped, not tenant-scoped).
  return /^\s*tenantId\s+String(?!\?)\b/m.test(body);
}

function main() {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const models = extractModelBlocks(schema);
  const scoped = models.filter((m) => hasDirectTenantIdField(m.body)).map((m) => m.name).sort();

  const header = `// GENERATED FILE — do not edit by hand.
// Run \`npx tsx scripts/generate-tenant-scoped-models.ts\` after any prisma/schema.prisma change
// that adds, removes, or renames a tenant-scoped model. Verified in sync by
// src/tests/security/tenant-scoped-models-sync.test.ts (part of \`npm run test:security\`).
//
// EXPORT_OS_MASTER_PLAN §5.2 — models with a direct \`tenantId\` field. Drives the Prisma
// extension in src/lib/tenant-scope.ts and the live two-tenant test.
`;

  const body = `export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([\n${scoped
    .map((name) => `  "${name}",`)
    .join("\n")}\n]);\n`;

  writeFileSync(OUT_PATH, header + "\n" + body);
  console.log(`Wrote ${scoped.length} tenant-scoped model(s) to ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
