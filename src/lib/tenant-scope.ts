import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
import { TENANT_SCOPED_MODELS } from './tenant-scope.generated';

/**
 * Tenant-isolation Layer 2, defence in depth behind the static scan (EXPORT_OS_MASTER_PLAN §5.2).
 * A request's scope is carried on an AsyncLocalStorage so the Prisma extension in src/lib/prisma.ts
 * can enforce it on every query without every call site threading a tenantId through by hand.
 *
 * Honest limits, written here because they are easy to forget under load:
 *  - Nested writes (e.g. `prisma.quote.update({ data: { lineItems: { create: [...] } } })`) are NOT
 *    rewritten — the extension only sees the top-level operation. Prefer child models without their
 *    own tenantId that inherit scope through their parent (TermsClause/NumberingCounter follow this;
 *    QuoteLineItem is the original example) so an unrewritten nested write is harmless by construction.
 *  - Raw SQL ($queryRaw/$executeRaw) is invisible to this layer entirely. Every raw-SQL call site must
 *    interpolate a tenantId parameter itself and carry a `// tenant-safe:` annotation (§5.1 step 4).
 *  - $transaction is only covered when started from the extended client exported by src/lib/prisma.ts.
 *    Never re-export the unextended base client — src/lib/prisma.ts keeps it module-private.
 */

export type Scope =
  | { kind: 'tenant'; tenantId: string; supportGrantId?: string }
  | { kind: 'platform'; reason: string };

export const scopeStore = new AsyncLocalStorage<Scope>();

/** Runs `fn` with every tenant-scoped Prisma query in its call tree scoped to `tenantId`. */
export function withTenant<T>(tenantId: string, fn: () => Promise<T>, supportGrantId?: string): Promise<T> {
  return scopeStore.run({ kind: 'tenant', tenantId, supportGrantId }, fn);
}

/**
 * Runs `fn` with tenant-scoped queries left unfiltered — a deliberate cross-tenant read/write.
 * Every call site must be listed in src/tests/security/platform-scope-allowlist.ts with a reason;
 * the isolation scan fails the build otherwise (§5.1 step 3).
 */
export function withPlatformScope<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  return scopeStore.run({ kind: 'platform', reason }, fn);
}

/** Thrown when a tenant-scoped write targets a row (or supplies a tenantId) outside the active scope. */
export class CrossTenantWriteError extends Error {
  constructor(model: string, operation: string) {
    super(`cross_tenant_write: ${model}.${operation} targeted a row outside the active tenant scope`);
    this.name = 'CrossTenantWriteError';
  }
}

function uncapitalize(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function mergeTenantWhere(where: unknown, tenantId: string): Record<string, unknown> {
  const base = (where ?? {}) as Record<string, unknown>;
  return { AND: [base, { tenantId }] };
}

const READ_MANY_OPS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);
const BULK_WRITE_OPS = new Set(['updateMany', 'deleteMany']);
const GUARDED_UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow']);
const GUARDED_TARGETED_WRITE_OPS = new Set(['update', 'delete']);

/**
 * Builds the `$allModels.$allOperations` extension consumed by src/lib/prisma.ts. Takes the raw
 * (unextended) client so guard reads and operation-rewrites (findUnique → findFirst) can run
 * without recursing back through this same extension.
 */
export function createTenantScopeExtension(rawClient: PrismaClient) {
  return {
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: {
          model?: string;
          operation: string;
          args: Record<string, unknown>;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) return query(args);

          const scope = scopeStore.getStore();
          if (!scope) {
            throw new Error(`tenant-scope: no scope active for ${model}.${operation} — wrap the call in withTenant or withPlatformScope`);
          }
          if (scope.kind === 'platform') return query(args);

          const { tenantId } = scope;
          const delegate = (rawClient as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[uncapitalize(model)];

          if (READ_MANY_OPS.has(operation) || BULK_WRITE_OPS.has(operation)) {
            return query({ ...args, where: mergeTenantWhere(args.where, tenantId) });
          }

          if (GUARDED_UNIQUE_OPS.has(operation)) {
            const result = await delegate.findFirst({ ...args, where: mergeTenantWhere(args.where, tenantId) });
            if (!result && operation === 'findUniqueOrThrow') {
              throw new Error(`No ${model} found matching the given unique input within the active tenant scope.`);
            }
            return result;
          }

          if (GUARDED_TARGETED_WRITE_OPS.has(operation)) {
            const existing = await delegate.findFirst({
              where: mergeTenantWhere(args.where, tenantId),
              select: { id: true },
            });
            if (!existing) throw new CrossTenantWriteError(model, operation);
            return query(args);
          }

          if (operation === 'upsert') {
            const existing = await delegate.findFirst({
              where: mergeTenantWhere(args.where, tenantId),
              select: { id: true },
            });
            if (existing) return query(args);
            const create = (args.create ?? {}) as Record<string, unknown>;
            if (create.tenantId != null && create.tenantId !== tenantId) {
              throw new CrossTenantWriteError(model, operation);
            }
            return query({ ...args, create: { ...create, tenantId } });
          }

          if (operation === 'create') {
            const data = (args.data ?? {}) as Record<string, unknown>;
            if (data.tenantId != null && data.tenantId !== tenantId) {
              throw new CrossTenantWriteError(model, operation);
            }
            return query({ ...args, data: { ...data, tenantId } });
          }

          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(args.data) ? args.data : [args.data];
            for (const row of rows as Record<string, unknown>[]) {
              if (row.tenantId != null && row.tenantId !== tenantId) {
                throw new CrossTenantWriteError(model, operation);
              }
            }
            const nextData = (rows as Record<string, unknown>[]).map((row) => ({ ...row, tenantId }));
            return query({ ...args, data: nextData });
          }

          // Any operation not enumerated above (e.g. a future Prisma op) fails closed rather than
          // silently passing through unscoped.
          throw new Error(`tenant-scope: unhandled operation ${model}.${operation} — add explicit handling before use`);
        },
      },
    },
  };
}
