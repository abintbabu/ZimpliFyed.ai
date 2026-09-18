import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * EXPORT_OS_MASTER_PLAN §5.2 — src/lib/tenant-scope.generated.ts must always match a fresh run of
 * scripts/generate-tenant-scoped-models.ts. A new tenant-scoped model that skips regeneration is a
 * live tenant-isolation gap (it won't be enforced by the Prisma extension or exercised by the live
 * test), so this fails the build rather than drifting silently. Pure, no DB: part of `npm run
 * test:security`.
 */

const repoRoot = path.join(__dirname, '..', '..', '..');
const generatedPath = path.join(repoRoot, 'src', 'lib', 'tenant-scope.generated.ts');

const before = readFileSync(generatedPath, 'utf8');

execFileSync('npx', ['tsx', 'scripts/generate-tenant-scoped-models.ts'], { cwd: repoRoot, stdio: 'pipe' });

const after = readFileSync(generatedPath, 'utf8');

assert.equal(
  after,
  before,
  'src/lib/tenant-scope.generated.ts is stale — run `npx tsx scripts/generate-tenant-scoped-models.ts` and commit the result',
);

console.log('✓ tenant-scope.generated.ts matches prisma/schema.prisma');
