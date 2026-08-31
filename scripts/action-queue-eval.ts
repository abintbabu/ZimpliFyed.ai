import { prisma } from '../src/lib/prisma';
import {
  evaluateGroup,
  EVAL_WINDOW,
  DEMOTE_REJECTIONS_7D,
  DEMOTE_REJECTION_RATE_LAST_10,
  type DecidedItem,
} from '../src/lib/action-queue-eval';

/**
 * Approve-without-edit eval (ROADMAP §3 / §7 item 1) — REPORTING ONLY. Per (tenantId, kind), prints the
 * rolling-window approve-without-edit rate, Wilson 95% lower bound, and whether the group currently meets
 * the L2 promotion or demotion threshold. Does NOT change any ActionQueueItem or drive actual promotion
 * (per-tenant autonomy-level wiring is a separate piece).
 *
 * Run: npm run action-queue:eval
 */

async function main() {
  const groups = await prisma.actionQueueItem.groupBy({
    by: ['tenantId', 'kind'],
    where: { status: { in: ['approved', 'rejected'] }, isDemo: false },
    _count: { _all: true },
    orderBy: [{ tenantId: 'asc' }, { kind: 'asc' }],
  });

  if (groups.length === 0) {
    console.log('[action-queue-eval] no decided ActionQueueItems yet — nothing to report.');
    return;
  }

  const rows: Record<string, string | number>[] = [];
  for (const g of groups) {
    const decided = await prisma.actionQueueItem.findMany({
      where: { tenantId: g.tenantId, kind: g.kind, status: { in: ['approved', 'rejected'] }, isDemo: false },
      orderBy: { decidedAt: 'desc' },
      take: EVAL_WINDOW,
      select: { status: true, editedOnApprove: true, decidedAt: true },
    });
    const items: DecidedItem[] = decided.map((d) => ({
      status: d.status as 'approved' | 'rejected',
      editedOnApprove: d.editedOnApprove,
      decidedAt: d.decidedAt ?? new Date(0), // decidedAt is set on decision; fall back for legacy rows
    }));
    // Exact 7-day rejection count (the fetched window is capped at EVAL_WINDOW, which could undercount).
    const rejections7d = await prisma.actionQueueItem.count({
      where: {
        tenantId: g.tenantId,
        kind: g.kind,
        status: 'rejected',
        isDemo: false,
        decidedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
    const r = evaluateGroup(items, g._count._all);
    r.rejectionsLast7d = rejections7d;
    r.meetsDemotion =
      rejections7d >= DEMOTE_REJECTIONS_7D ||
      (r.rejectionRateLast10 !== null && r.rejectionRateLast10 > DEMOTE_REJECTION_RATE_LAST_10);
    rows.push({
      tenant: g.tenantId,
      kind: g.kind,
      decided: r.totalDecided,
      window: r.windowSize,
      'appr-unedited': r.approvedUnedited,
      rate: r.rate === null ? '—' : (r.rate * 100).toFixed(1) + '%',
      'wilson-lb': r.wilsonLB === null ? '—' : (r.wilsonLB * 100).toFixed(1) + '%',
      'rej-7d': r.rejectionsLast7d,
      'rej-last10': r.rejectionRateLast10 === null ? '—' : (r.rejectionRateLast10 * 100).toFixed(0) + '%',
      verdict: r.meetsDemotion ? 'DEMOTE' : r.meetsPromotion ? 'PROMOTE-ELIGIBLE' : 'hold',
    });
  }
  console.table(rows);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
