# Expand–Contract Schema Migrations

_Owner: CTO · DEV_PLAN_100 Sprint 1 · pays down the debt logged in [DECISIONS.md](DECISIONS.md) 2026-07-11._

## Why this exists

This project applies schema changes with `prisma db push` against a live database — there are no migration
files to review, so **the diff of `schema.prisma` is the migration**. A destructive change (renaming or
dropping a column) applied in one step will break any deployment still running the old Prisma client: that is
exactly what happened when `stripeCustomerId` → `providerCustomerId` shipped as a rename and a stale
deployment blank-screened a real tenant with a `P2022` error.

The rule from here: **never rename or drop a column in a single step once there is more than one tenant.**
Every destructive change is split into three deploys.

## The three phases

### 1. EXPAND (additive, always safe)
- Add the **new** field alongside the old one. Do **not** touch the old field.
- New field is nullable (or defaulted) so existing rows are valid.
- `npm run db:push`, deploy. Old and new code both run fine — old code ignores the new column.

### 2. BACKFILL + dual-write
- Ship code that **writes both** fields and **reads the new** one.
- Backfill existing rows: copy `old → new` (a one-off script in `scripts/`).
- Deploy. Verify: no code path reads the old field anymore (grep the codebase).

### 3. CONTRACT (destructive, last)
- Only once **every** running deployment reads the new field and nothing reads the old one:
  remove the old field from `schema.prisma`.
- Run the guard with the override: `ALLOW_SCHEMA_DROP=1 npx tsx scripts/check-schema-safety.ts`, then `db:push`.

## The guard

`scripts/check-schema-safety.ts` diffs `schema.prisma` against `HEAD` and **fails on any removed field**,
which blocks accidental one-step drops/renames. It is wired into CI and can be added as a `pre-push` hook.
A reviewed CONTRACT-phase removal passes it with `ALLOW_SCHEMA_DROP=1`.

```bash
npx tsx scripts/check-schema-safety.ts        # fails if a field was removed
ALLOW_SCHEMA_DROP=1 npx tsx scripts/check-schema-safety.ts   # explicit, reviewed contract step
```

## Checklist (paste into the PR that changes the schema)

- [ ] Change is **additive** (new fields/models only) — or —
- [ ] Destructive change is split: this PR is **EXPAND / BACKFILL / CONTRACT** (circle one)
- [ ] New fields are nullable or defaulted
- [ ] If BACKFILL: backfill script added and run against prod; dual-write confirmed
- [ ] If CONTRACT: verified no code reads the old field (`grep`), all deploys on new code
- [ ] `npx tsx scripts/check-schema-safety.ts` passes (or `ALLOW_SCHEMA_DROP=1` with reason in the PR)
- [ ] `DATABASE_PLAN.md` refreshed if models/relations changed
