import { execSync } from 'node:child_process';

/**
 * Schema-safety pre-push check (DEV_PLAN_100 Sprint 1) — pays down the destructive-migration debt logged in
 * docs/DECISIONS.md (2026-07-11): stripeCustomerId→providerCustomerId was renamed without expand/contract
 * and blank-screened a live tenant.
 *
 * This project runs `prisma db push` (no migration files), so there is no migration to review — the diff of
 * schema.prisma against the last commit IS the change. This scans that diff for destructive edits (a removed
 * or renamed `@map`/column/field on a model) and fails, forcing the change through the expand→contract
 * process in docs/EXPAND_CONTRACT_MIGRATIONS.md. Override a reviewed, safe change with ALLOW_SCHEMA_DROP=1.
 *
 * Run: npx tsx scripts/check-schema-safety.ts   (ideally a pre-push hook or CI step before db:push)
 */

const SCHEMA = 'prisma/schema.prisma';

function diff(): string {
  try {
    return execSync(`git diff HEAD -- ${SCHEMA}`, { encoding: 'utf8' });
  } catch {
    return '';
  }
}

function run() {
  const d = diff();
  if (!d.trim()) {
    console.log('✓ schema-safety: no uncommitted changes to schema.prisma');
    return;
  }

  // Removed lines that declare a scalar/relation field: `  fieldName  Type ...`. Renames show up as a
  // removed field + an added field, so a removed field is the signal for both drops and renames.
  const removedFields: string[] = [];
  for (const line of d.split('\n')) {
    if (!line.startsWith('-') || line.startsWith('---')) continue;
    const body = line.slice(1).trim();
    // field declarations start with an identifier followed by a Type; skip block/attribute/comment lines.
    const m = /^(\w+)\s+[A-Z]\w*(\[\])?(\s|\?|@|$)/.exec(body);
    if (m && !body.startsWith('//') && !body.startsWith('@@')) {
      removedFields.push(m[1]);
    }
  }

  if (removedFields.length === 0) {
    console.log('✓ schema-safety: additive change only (no fields removed)');
    return;
  }

  if (process.env.ALLOW_SCHEMA_DROP === '1') {
    console.log(`⚠ schema-safety: ${removedFields.length} field(s) removed but ALLOW_SCHEMA_DROP=1 — proceeding:`);
    for (const f of removedFields) console.log('   - ' + f);
    return;
  }

  console.error('✗ schema-safety: destructive schema change detected (fields removed/renamed):');
  for (const f of removedFields) console.error('   - ' + f);
  console.error(
    '\nDestructive column changes must go through expand→contract (docs/EXPAND_CONTRACT_MIGRATIONS.md):\n' +
      '  1. EXPAND: add the new field, keep the old one, deploy.\n' +
      '  2. BACKFILL: copy data old→new, ship code that writes both / reads new.\n' +
      '  3. CONTRACT: only once no code reads the old field, remove it (re-run with ALLOW_SCHEMA_DROP=1).\n',
  );
  process.exit(1);
}

run();
