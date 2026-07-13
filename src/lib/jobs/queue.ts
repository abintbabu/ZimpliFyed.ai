import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type { JobKind, JobPayloads } from './handlers';

/**
 * Durable Postgres-backed job queue (DEV_PLAN_100 Sprint 1).
 *
 * Design goals, in order: (1) no work is lost on crash, (2) a job runs at most once to
 * *success* even under webhook replay, (3) the transport can be swapped for SQS/QStash at
 * Stage 5 without touching a single producer. Producers call `enqueue`; the worker
 * (scripts/worker.ts) calls `claim` / `complete` / `fail`.
 */

const LEASE_MS = 5 * 60 * 1000; // a worker holds a claimed job for 5 min before it can be reclaimed

/** Enqueue a job. Pass `idempotencyKey` to make the enqueue itself replay-safe: a second enqueue
 * with the same (kind, key) is a no-op that returns the existing job's id. */
export async function enqueue<K extends JobKind>(
  input: {
    tenantId: string;
    kind: K;
    payload: JobPayloads[K];
    idempotencyKey?: string;
    runAfter?: Date;
    maxAttempts?: number;
  },
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<{ id: string; deduped: boolean }> {
  if (input.idempotencyKey) {
    const existing = await tx.job.findUnique({
      where: { kind_idempotencyKey: { kind: input.kind, idempotencyKey: input.idempotencyKey } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, deduped: true };
  }

  try {
    const job = await tx.job.create({
      data: {
        tenantId: input.tenantId,
        kind: input.kind,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        idempotencyKey: input.idempotencyKey,
        runAfter: input.runAfter ?? new Date(),
        maxAttempts: input.maxAttempts ?? 5,
      },
      select: { id: true },
    });
    return { id: job.id, deduped: false };
  } catch (err) {
    // Unique (kind, idempotencyKey) collision under a concurrent enqueue — treat as dedupe.
    if (isUniqueViolation(err) && input.idempotencyKey) {
      const existing = await tx.job.findUnique({
        where: { kind_idempotencyKey: { kind: input.kind, idempotencyKey: input.idempotencyKey } },
        select: { id: true },
      });
      if (existing) return { id: existing.id, deduped: true };
    }
    throw err;
  }
}

export type ClaimedJob = {
  id: string;
  tenantId: string;
  kind: JobKind;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

/** Atomically claim the next runnable job for this worker. Returns null if the queue is idle.
 * Uses SKIP LOCKED so many workers can poll the same table without contending. */
export async function claim(workerId: string): Promise<ClaimedJob | null> {
  const leaseCutoff = new Date(Date.now() - LEASE_MS);
  const rows = await prisma.$queryRaw<
    Array<{ id: string; tenantId: string; kind: string; payload: unknown; attempts: number; maxAttempts: number }>
  >`
    UPDATE "Job" SET
      status = 'active',
      "lockedAt" = now(),
      "lockedBy" = ${workerId},
      attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "Job"
      WHERE "runAfter" <= now()
        AND (
          status = 'queued'
          OR (status = 'active' AND "lockedAt" < ${leaseCutoff})
        )
      ORDER BY "runAfter" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, "tenantId", kind, payload, attempts, "maxAttempts";
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind as JobKind,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
  };
}

export async function complete(jobId: string): Promise<void> {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: 'completed', completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
  });
}

/** Record a failure. Reschedules with exponential backoff until maxAttempts, then parks as `failed`. */
export async function fail(job: ClaimedJob, error: unknown): Promise<void> {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(3600, 2 ** job.attempts * 5); // 10s, 20s, 40s … capped at 1h
  await prisma.job.update({
    where: { id: job.id },
    data: exhausted
      ? { status: 'failed', lastError: message.slice(0, 2000), lockedAt: null, lockedBy: null }
      : {
          status: 'queued',
          lastError: message.slice(0, 2000),
          lockedAt: null,
          lockedBy: null,
          runAfter: new Date(Date.now() + backoffSec * 1000),
        },
  });
}

export function newWorkerId(): string {
  return `${process.env.HOSTNAME ?? 'worker'}-${randomUUID().slice(0, 8)}`;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}
