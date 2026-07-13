import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Cross-tenant isolation guard (DEV_PLAN_100 Sprint 1; SECURITY_BASELINE §isolation).
 * MERGE-BLOCKING — wired into CI via `npm run test:security`.
 *
 * The structural isolation rule (CTO_TECH_PLAN §1.1): every read/write of a tenant-scoped model must be
 * filtered by tenantId, and every server action must authenticate the tenant first. A runtime two-tenant
 * test needs a live DB (deferred — the pooler hangs); this static analysis catches the same class of bug
 * deterministically and offline, so it can gate every PR.
 *
 * It enforces two invariants over src/actions/*.ts:
 *   (A) each file that touches tenant data calls requireTenantSession() (or is explicitly exempt);
 *   (B) every `prisma.<model>.<op>(...)` on a tenant-scoped model mentions `tenantId` in its argument
 *       object — in the `where` (reads/updates/deletes) or the `data` (creates).
 *
 * Escape hatch for a genuinely-safe call the heuristic can't see: append `// tenant-safe: <reason>` on
 * the same line as the prisma call. Reasons are grep-auditable.
 *
 * Run: npx tsx --conditions=react-server src/tests/security/tenant-isolation.test.ts
 */

const ROOT = process.cwd();
const ACTIONS_DIR = path.join(ROOT, 'src', 'actions');
const SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');

// Files that legitimately operate across tenants (platform admin / global tables). Keep this list tiny
// and reviewed — every entry is an isolation exception.
const FILE_EXEMPT = new Set<string>([
  // e.g. 'platform-admin.ts'
]);

// Prisma operations that read or write rows and therefore must be tenant-filtered.
const GUARDED_OPS = [
  'findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow',
  'update', 'updateMany', 'delete', 'deleteMany', 'create', 'createMany', 'upsert', 'count', 'aggregate', 'groupBy',
];

/** Parse schema.prisma → set of Prisma client accessors (camelCase) for models that carry a tenantId. */
function tenantScopedAccessors(): Set<string> {
  const src = readFileSync(SCHEMA, 'utf8');
  const accessors = new Set<string>();
  const modelRe = /model\s+(\w+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src))) {
    const [, name, body] = m;
    if (/\btenantId\s+String/.test(body)) {
      accessors.add(name[0].toLowerCase() + name.slice(1));
    }
  }
  return accessors;
}

/** Extract the balanced (...) argument text starting at the '(' index. */
function balancedArgs(src: string, openParenIdx: number): string {
  let depth = 0;
  for (let i = openParenIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(openParenIdx + 1, i);
    }
  }
  return src.slice(openParenIdx + 1);
}

function lineOf(src: string, idx: number): number {
  return src.slice(0, idx).split('\n').length;
}

function run() {
  const scoped = tenantScopedAccessors();
  assert.ok(scoped.size > 10, `expected many tenant-scoped models, found ${scoped.size} — schema parse likely broke`);

  const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 0, 'no action files found — path wrong?');

  const violations: string[] = [];

  for (const file of files) {
    if (FILE_EXEMPT.has(file)) continue;
    const src = readFileSync(path.join(ACTIONS_DIR, file), 'utf8');
    const lines = src.split('\n');

    // Find every prisma.<accessor>.<op>( on a tenant-scoped model.
    const callRe = /prisma\.(\w+)\.(\w+)\s*\(/g;
    let touchesTenantData = false;
    let c: RegExpExecArray | null;
    while ((c = callRe.exec(src))) {
      const [, accessor, op] = c;
      if (!scoped.has(accessor) || !GUARDED_OPS.includes(op)) continue;
      touchesTenantData = true;

      const line = lineOf(src, c.index);
      if (lines[line - 1]?.includes('// tenant-safe:')) continue; // audited escape hatch

      const args = balancedArgs(src, callRe.lastIndex - 1);
      if (!/\btenantId\b/.test(args)) {
        violations.push(`${file}:${line}  prisma.${accessor}.${op}() has no tenantId in its arguments`);
      }
    }

    // Invariant A: a file touching tenant data must authenticate the tenant.
    if (touchesTenantData && !/requireTenantSession|requireRole|requirePlatformAdmin/.test(src)) {
      violations.push(`${file}  touches tenant data but never calls requireTenantSession()/requireRole()`);
    }
  }

  if (violations.length) {
    console.error(`✗ tenant-isolation: ${violations.length} potential cross-tenant leak(s):\n`);
    for (const v of violations) console.error('  • ' + v);
    console.error('\nFix by adding a tenantId filter, or annotate a proven-safe call with `// tenant-safe: <reason>`.');
    process.exit(1);
  }

  console.log(`✓ tenant-isolation: ${files.length} action files scanned, ${scoped.size} tenant-scoped models guarded, 0 violations`);
}

run();
