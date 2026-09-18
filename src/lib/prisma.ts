import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Lazy: only stand up a real pg Pool against DATABASE_URL when nothing has already injected a client (tests
// set globalThis.prisma to an in-memory fake before this module loads) — constructing PrismaPg eagerly here
// used to hang test runs that import a route module without a live DB, since DATABASE_URL is a pooler.
//
// NOT yet wrapped with the tenant-scope extension (src/lib/tenant-scope.ts, EXPORT_OS_MASTER_PLAN §5.2).
// That extension enforces "missing scope throws", which requires every tenant-scoped Prisma call site
// across the app to be wrapped in withTenant()/withPlatformScope() first — a separate, larger migration
// than Wave 0 covers. The extension and its generated model list are built and tested; wiring them into
// this export is deliberately deferred until that call-site migration happens (see docs/EXPORT_OS_MASTER_PLAN.md
// §5.2 and the Wave 0 plan). Layer 1 (the static scan) and Layer 3 (the live test) remain the enforced
// isolation guarantees until then.
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
