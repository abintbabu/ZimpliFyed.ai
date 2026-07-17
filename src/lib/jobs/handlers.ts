import 'server-only';

/**
 * Job handler registry (DEV_PLAN_100 Sprint 1).
 *
 * Each async workflow registers one handler here with a typed payload. The queue (queue.ts) is
 * transport; this file is the map of what can run. Handlers are plain async functions — they must be
 * idempotent (a job may run more than once on crash-retry) and must not assume any ambient request
 * context: everything they need comes from the payload plus the tenantId.
 *
 * Sprint-4 pipelines (expense extraction), Stage-2 inbox ingestion, and Stage-3 AgentRun steps all
 * register here. Kept intentionally small at Sprint 1 — one real handler plus the shape for the rest.
 */

export type JobPayloads = {
  // Sprint 1: a trivial handler proving the loop end-to-end and usable as a health probe.
  'noop': { note?: string };
  // Sprint 4 (document/vision pipeline) — declared now so producers can be written against the type.
  'pipeline.extract': { documentId: string; docType: string };
  // Sprint 4: expense snap — extract + classify + gate one uploaded Expense row.
  'expense.extract': { expenseId: string };
  // Stage 2 (unified inbox) — classify one already-persisted inbound message (intent + summary).
  'inbox.ingest': { messageId: string };
  // Stage 2 (unified inbox) — pull new messages from one pullable channel's provider (e.g. Gmail).
  'inbox.sync': { channelId: string };
};

export type JobKind = keyof JobPayloads;

export type JobContext = { tenantId: string; jobId: string; attempts: number };

type Handler<K extends JobKind> = (payload: JobPayloads[K], ctx: JobContext) => Promise<void>;

/** The registry. New handlers are added here as their sprints land. */
const handlers: { [K in JobKind]?: Handler<K> } = {
  noop: async (payload, ctx) => {
    // Deliberately does nothing but prove the worker path. Logged by the worker on completion.
    void payload;
    void ctx;
  },
  'expense.extract': async (payload, ctx) => {
    const { runExpensePipeline } = await import('@/ai/pipelines/expense');
    await runExpensePipeline(payload.expenseId, ctx.tenantId);
  },
  'inbox.ingest': async (payload, ctx) => {
    const { runInboxIngest } = await import('@/lib/inbox/ingest');
    await runInboxIngest(payload.messageId, ctx.tenantId);
  },
  'inbox.sync': async (payload, ctx) => {
    const { syncChannelCore } = await import('@/lib/inbox/sync');
    await syncChannelCore(payload.channelId, ctx.tenantId);
  },
};

export function getHandler<K extends JobKind>(kind: K): Handler<K> | undefined {
  return handlers[kind];
}

export function registerHandler<K extends JobKind>(kind: K, handler: Handler<K>): void {
  (handlers as Record<string, Handler<JobKind>>)[kind] = handler as Handler<JobKind>;
}

export function registeredKinds(): JobKind[] {
  return Object.keys(handlers) as JobKind[];
}
