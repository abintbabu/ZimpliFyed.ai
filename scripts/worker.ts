import { claim, complete, fail, newWorkerId } from '../src/lib/jobs/queue';
import { getHandler } from '../src/lib/jobs/handlers';

/**
 * Job worker loop (DEV_PLAN_100 Sprint 1).
 *
 * Run one or more of these alongside the Next app (Fly/Railway process, or `npm run worker` in dev):
 * Vercel serves humans, this serves machines. Polls the Job table, claims one job at a time with a
 * lease, runs its handler, and marks complete/failed. Multiple instances are safe — claim() uses
 * FOR UPDATE SKIP LOCKED.
 *
 * Scales to SQS/QStash at Stage 5 by replacing claim/complete/fail's transport, not this loop.
 */

const IDLE_DELAY_MS = 1000; // backoff when the queue is empty
const BUSY_DELAY_MS = 0; // drain as fast as possible while there's work

const workerId = newWorkerId();
let running = true;

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: workerId, msg, ...extra }));
}

async function tick(): Promise<'busy' | 'idle'> {
  const job = await claim(workerId);
  if (!job) return 'idle';

  const handler = getHandler(job.kind);
  if (!handler) {
    await fail(job, new Error(`No handler registered for job kind "${job.kind}"`));
    log('job.no_handler', { jobId: job.id, kind: job.kind });
    return 'busy';
  }

  const startedAt = Date.now();
  try {
    await handler(job.payload as never, { tenantId: job.tenantId, jobId: job.id, attempts: job.attempts });
    await complete(job.id);
    log('job.completed', { jobId: job.id, kind: job.kind, ms: Date.now() - startedAt });
  } catch (err) {
    await fail(job, err);
    log('job.failed', {
      jobId: job.id,
      kind: job.kind,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return 'busy';
}

async function main() {
  log('worker.start');
  while (running) {
    let result: 'busy' | 'idle';
    try {
      result = await tick();
    } catch (err) {
      // A claim() / DB error — don't hot-loop; back off and try again.
      log('worker.tick_error', { error: err instanceof Error ? err.message : String(err) });
      result = 'idle';
    }
    await sleep(result === 'idle' ? IDLE_DELAY_MS : BUSY_DELAY_MS);
  }
  log('worker.stopped');
  process.exit(0);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    log('worker.shutdown_signal', { sig });
    running = false;
  });
}

main().catch((err) => {
  log('worker.fatal', { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
