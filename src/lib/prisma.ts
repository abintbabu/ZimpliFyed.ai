import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Lazy: only stand up a real pg Pool against DATABASE_URL when nothing has already injected a client (tests
// set globalThis.prisma to an in-memory fake before this module loads) — constructing PrismaPg eagerly here
// used to hang test runs that import a route module without a live DB, since DATABASE_URL is a pooler.
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
