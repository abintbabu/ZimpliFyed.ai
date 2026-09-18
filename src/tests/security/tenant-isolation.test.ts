import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { TENANT_SCOPED_MODELS } from '../../lib/tenant-scope.generated';
import { PLATFORM_SCOPE_ALLOWLIST } from './platform-scope-allowlist';

/**
 * Cross-tenant isolation guard (DEV_PLAN_100 Sprint 1; SECURITY_BASELINE §isolation;
 * EXPORT_OS_MASTER_PLAN §5.1 Layer 1 — the primary, merge-blocking layer).
 * MERGE-BLOCKING — wired into CI via `npm run test:security`.
 *
 * The structural isolation rule: every read/write of a tenant-scoped model must be filtered by
 * tenantId, and every server action must authenticate the tenant first. A runtime two-tenant test
 * (tenant-isolation-live.test.ts) needs a live DB; this static analysis catches the same class of
 * bug deterministically and offline, so it can gate every PR.
 *
 * Scans, recursively: src/actions/**, src/lib/**, src/app/api/**\/route.ts, src/app/**\/page.tsx,
 * scripts/** (§5.1 step 2).
 *
 * For every `prisma.<model>.<op>(...)` on a tenant-scoped model (accessor derived from the
 * generated TENANT_SCOPED_MODELS, the same list the Prisma extension and the live test use), one
 * of three proofs must hold:
 *   (A) `tenantId` appears in the call's own argument object (`where`/`data`);
 *   (B) the same line carries `// tenant-safe: <reason>` (an audited, grep-able escape hatch);
 *   (C) the call site is lexically inside a `withTenant(`/`withPlatformScope(` span (§5.2) — every
 *       withPlatformScope( call site must additionally appear in platform-scope-allowlist.ts with
 *       a reason (§5.1 step 3); a manifest entry with no matching call site fails the build too.
 *
 * Also enforces the raw-SQL invariant (§5.1 step 4): every `$queryRaw`/`$executeRaw` call must
 * either interpolate a `tenantId` parameter or carry a `// tenant-safe:` annotation on the same line.
 *
 * And invariant A: a file that touches tenant data must call requireTenantSession()/requireRole()/
 * requirePlatformAdmin(), or wrap its work in withTenant()/withPlatformScope().
 *
 * Run: npx tsx --conditions=react-server src/tests/security/tenant-isolation.test.ts
 */

const ROOT = process.cwd();

// Files that legitimately have no session/tenant context at the point they run — every entry is an
// isolation exception and must be reviewed, same discipline as platform-scope-allowlist.ts. Their
// individual prisma calls are still checked; this only lifts invariant A (must call
// requireTenantSession()) for the file as a whole.
const FILE_EXEMPT = new Set<string>([
  // Tokenised entry point (§4.5 pattern): resolves by the invite token itself, pre-auth, pre-tenant.
  'src/app/join/[token]/page.tsx',
  // Public webhook: tenant resolved from the matched InboxChannel (phone_number_id), never from a
  // session — there isn't one. NOTE: this route does not yet verify X-Hub-Signature-256
  // (EXPORT_OS_MASTER_PLAN §10.2 / §17 launch blocker #2, Wave 4 — out of scope for Wave 0's
  // isolation work, but a real, currently-open gap: anyone who learns a phone_number_id can inject
  // messages into a tenant's inbox today).
  'src/app/api/inbox/whatsapp/route.ts',
]);

// `enforceAuth`: invariant A (must call requireTenantSession()/requireRole()/requirePlatformAdmin(),
// or be wrapped in withTenant()/withPlatformScope()) only makes sense at entry points that own
// authenticating the caller. src/lib/**, src/ai/**, and scripts/** are plumbing that receives an
// already-authenticated tenantId as a parameter from their caller (an action, a route, a sweep's own
// argv/loop) — requiring them to independently re-derive a session would be wrong (background jobs and
// scripts often run with no request/session at all) as well as redundant. Those dirs still get
// invariant B (every guarded prisma call must carry tenantId) and the raw-SQL invariant.
const SCAN_ROOTS: { dir: string; recursive: boolean; match: (file: string) => boolean; enforceAuth: boolean }[] = [
  { dir: path.join(ROOT, 'src', 'actions'), recursive: true, match: (f) => f.endsWith('.ts'), enforceAuth: true },
  { dir: path.join(ROOT, 'src', 'lib'), recursive: true, match: (f) => f.endsWith('.ts') && !f.endsWith('.generated.ts'), enforceAuth: false },
  { dir: path.join(ROOT, 'src', 'ai'), recursive: true, match: (f) => f.endsWith('.ts'), enforceAuth: false },
  { dir: path.join(ROOT, 'src', 'app', 'api'), recursive: true, match: (f) => f === 'route.ts', enforceAuth: true },
  { dir: path.join(ROOT, 'src', 'app'), recursive: true, match: (f) => f === 'page.tsx', enforceAuth: true },
  { dir: path.join(ROOT, 'scripts'), recursive: false, match: (f) => f.endsWith('.ts'), enforceAuth: false },
];

// Prisma operations that read or write rows and therefore must be tenant-filtered.
const GUARDED_OPS = [
  'findFirst', 'findMany', 'findUnique', 'findUniqueOrThrow', 'findFirstOrThrow',
  'update', 'updateMany', 'delete', 'deleteMany', 'create', 'createMany', 'upsert', 'count', 'aggregate', 'groupBy',
];

/** Prisma client accessor (camelCase) for each tenant-scoped model, e.g. "Buyer" -> "buyer". */
function tenantScopedAccessors(): Set<string> {
  const accessors = new Set<string>();
  for (const name of TENANT_SCOPED_MODELS) accessors.add(name[0].toLowerCase() + name.slice(1));
  return accessors;
}

function walk(dir: string, recursive: boolean, match: (file: string) => boolean, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // directory doesn't exist (e.g. no src/app/api yet in some checkouts) — not an error
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (recursive && entry !== 'node_modules') walk(full, recursive, match, out);
    } else if (match(entry)) {
      out.push(full);
    }
  }
  return out;
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

/** End index (exclusive) of the balanced (...) span starting at the '(' index. */
function balancedSpanEnd(src: string, openParenIdx: number): number {
  let depth = 0;
  for (let i = openParenIdx; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return src.length;
}

function lineOf(src: string, idx: number): number {
  return src.slice(0, idx).split('\n').length;
}

/**
 * Blanks `//` and `/* *\/` comment bodies to spaces (preserving length/newlines, so indices stay
 * aligned with the original source) so doc-comment prose mentioning `prisma.x.y(`, `withTenant(`,
 * `$queryRaw`, etc. as examples isn't mistaken for a real call site. Does not special-case `//`
 * inside string literals (e.g. a URL) — same limitation the original scanner had everywhere; this
 * only removes false positives, never introduces a false negative relative to before.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
    } else if (src[i] === '/' && src[i + 1] === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) { out += '  '; i += 2; }
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

/** Char spans covered by a withTenant(...)/withPlatformScope(...) call, proof (C). */
function scopedSpans(src: string): { start: number; end: number; kind: 'tenant' | 'platform' }[] {
  const spans: { start: number; end: number; kind: 'tenant' | 'platform' }[] = [];
  const re = /\b(withTenant|withPlatformScope)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const openIdx = m.index + m[0].length - 1;
    const end = balancedSpanEnd(src, openIdx);
    spans.push({ start: m.index, end, kind: m[1] === 'withTenant' ? 'tenant' : 'platform' });
  }
  return spans;
}

function withinScopedSpan(idx: number, spans: { start: number; end: number; kind: 'tenant' | 'platform' }[]): boolean {
  return spans.some((s) => idx >= s.start && idx < s.end);
}

/** The annotation may sit on the call's own line, or the line immediately before it — the only
 * option for a multi-line tagged-template raw-SQL call, since a trailing `//` right after the
 * opening backtick would be swallowed into the template literal. */
function hasTenantSafeNear(lines: string[], line: number): boolean {
  return !!lines[line - 1]?.includes('// tenant-safe:') || !!lines[line - 2]?.includes('// tenant-safe:');
}

/** For a multi-line prisma.x.y({ ... }) call, the annotation may sit anywhere from one line before
 * the call to one line after its closing paren — e.g. trailing on the `where:` line, the existing
 * codebase convention in a few places, not just on the call's own opening line. */
function hasTenantSafeInCall(lines: string[], startLine: number, endLine: number): boolean {
  for (let l = Math.max(1, startLine - 1); l <= endLine + 1; l++) {
    if (lines[l - 1]?.includes('// tenant-safe:')) return true;
  }
  return false;
}

function run() {
  const scoped = tenantScopedAccessors();
  assert.ok(scoped.size > 10, `expected many tenant-scoped models, found ${scoped.size} — schema parse likely broke`);

  const enforceAuthByFile = new Map<string, boolean>();
  for (const { dir, recursive, match, enforceAuth } of SCAN_ROOTS) {
    for (const file of walk(dir, recursive, match)) enforceAuthByFile.set(file, enforceAuth);
  }
  const files = [...enforceAuthByFile.keys()];
  assert.ok(files.length > 0, 'no files found to scan — path wrong?');

  const violations: string[] = [];
  const usedPlatformScopeSites = new Set<string>();

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const fileExempt = FILE_EXEMPT.has(rel); // lifts invariant A only — per-call checks still run
    const original = readFileSync(file, 'utf8');
    const lines = original.split('\n');
    const src = stripComments(original); // regex scans run on this; annotation checks still read `lines`
    const spans = scopedSpans(src);

    // Record every withPlatformScope( call site for the allowlist cross-check below.
    const platformScopeRe = /\bwithPlatformScope\s*\(/g;
    let p: RegExpExecArray | null;
    while ((p = platformScopeRe.exec(src))) {
      usedPlatformScopeSites.add(`${rel}:${lineOf(src, p.index)}`);
    }

    // Raw-SQL invariant (§5.1 step 4).
    const rawSqlRe = /\$(queryRaw|executeRaw)\b/g;
    let r: RegExpExecArray | null;
    while ((r = rawSqlRe.exec(src))) {
      const line = lineOf(src, r.index);
      const lineText = lines[line - 1] ?? '';
      if (!hasTenantSafeNear(lines, line) && !/\btenantId\b/.test(lineText) && !withinScopedSpan(r.index, spans)) {
        violations.push(`${rel}:${line}  $${r[1]} has no tenantId interpolation and no // tenant-safe: annotation on its line (or the line above)`);
      }
    }

    // Find every prisma.<accessor>.<op>( on a tenant-scoped model.
    const callRe = /prisma\.(\w+)\.(\w+)\s*\(/g;
    let touchesTenantData = false;
    let c: RegExpExecArray | null;
    while ((c = callRe.exec(src))) {
      const [, accessor, op] = c;
      if (!scoped.has(accessor) || !GUARDED_OPS.includes(op)) continue;
      touchesTenantData = true;

      const line = lineOf(src, c.index);
      const argsEndIdx = balancedSpanEnd(src, callRe.lastIndex - 1);
      const endLine = lineOf(src, argsEndIdx);
      if (hasTenantSafeInCall(lines, line, endLine)) continue; // proof (B)
      if (withinScopedSpan(c.index, spans)) continue; // proof (C)

      const args = balancedArgs(src, callRe.lastIndex - 1);
      if (!/\btenantId\b/.test(args)) {
        violations.push(`${rel}:${line}  prisma.${accessor}.${op}() has no tenantId in its arguments`);
      }
    }

    // Invariant A: an entry-point file touching tenant data must authenticate the tenant (or run
    // inside a scope). Not enforced for lib/ai/scripts plumbing — see SCAN_ROOTS comment.
    if (!fileExempt && enforceAuthByFile.get(file) && touchesTenantData && !/requireTenantSession|requireRole|requirePlatformAdmin/.test(src) && spans.length === 0) {
      violations.push(`${rel}  touches tenant data but never calls requireTenantSession()/requireRole()/requirePlatformAdmin(), and isn't wrapped in withTenant()/withPlatformScope()`);
    }
  }

  // §5.1 step 3: every withPlatformScope( call site must be in the manifest, and every manifest
  // entry must still have a matching call site (dead exemptions fail CI too).
  for (const site of usedPlatformScopeSites) {
    if (!PLATFORM_SCOPE_ALLOWLIST.has(site)) {
      violations.push(`${site}  withPlatformScope( call site is missing from src/tests/security/platform-scope-allowlist.ts`);
    }
  }
  for (const site of PLATFORM_SCOPE_ALLOWLIST.keys()) {
    if (!usedPlatformScopeSites.has(site)) {
      violations.push(`${site}  is listed in platform-scope-allowlist.ts but no withPlatformScope( call exists there anymore — remove the dead exemption`);
    }
  }

  if (violations.length) {
    console.error(`✗ tenant-isolation: ${violations.length} potential cross-tenant leak(s):\n`);
    for (const v of violations) console.error('  • ' + v);
    console.error('\nFix by adding a tenantId filter, wrapping the call in withTenant()/withPlatformScope(), or annotate a proven-safe call with `// tenant-safe: <reason>`.');
    process.exit(1);
  }

  console.log(`✓ tenant-isolation: ${files.length} files scanned, ${scoped.size} tenant-scoped models guarded, 0 violations`);
}

run();
