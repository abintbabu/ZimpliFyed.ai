import { prisma } from '../src/lib/prisma';
import { enqueueAction } from '../src/lib/action-queue';

/**
 * Receivables chase sweep (CPO_PRODUCT_PLAN §3.10 "chase payment"): finds export invoices that are past
 * their due date with a balance still owing and surfaces a chase action in the cross-department Action
 * Queue (MONEY). L1 — the founder approves before anything goes to the buyer.
 *
 * Run nightly (see .github/workflows/receivables-chase-sweep.yml). Same convention as the billing/
 * compliance/followup sweeps: Postgres table + polling, no queue infra.
 *
 * Dedup: enqueueAction's dedupeKey (`chase_invoice:<id>`) means an invoice that is already sitting in the
 * queue unresolved is not re-enqueued each night; once the founder decides it, a still-overdue invoice
 * becomes chaseable again on the next run.
 */

const CHASEABLE_STATUSES = ['sent', 'partially_paid', 'overdue'] as const;

async function sweepReceivablesChase() {
  const now = new Date();
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { in: [...CHASEABLE_STATUSES] },
      balanceDue: { gt: 0 },
      dueDate: { lt: now },
      isCreditOrDebitNote: false,
    },
    include: { order: { include: { buyer: true } } },
    orderBy: [{ tenantId: 'asc' }, { dueDate: 'asc' }],
  });

  let enqueued = 0;
  for (const inv of invoices) {
    const daysOverdue = Math.floor((now.getTime() - inv.dueDate!.getTime()) / (24 * 60 * 60 * 1000));
    const buyerName = inv.order?.buyer?.name ?? 'the buyer';
    await enqueueAction({
      tenantId: inv.tenantId,
      kind: 'dunning_nudge',
      department: 'MONEY',
      title: `Chase payment — ${inv.invoiceNumber} (${buyerName})`,
      summary: `${inv.currency} ${inv.balanceDue.toFixed(2)} outstanding, ${daysOverdue}d past due. Approve a payment reminder to ${buyerName}.`,
      confidence: undefined,
      linkedType: 'invoice',
      linkedId: inv.id,
      dedupeKey: `chase_invoice:${inv.id}`,
    });
    enqueued += 1;
    console.log(`[receivables] tenant=${inv.tenantId} invoice=${inv.invoiceNumber} overdue=${daysOverdue}d balance=${inv.currency} ${inv.balanceDue.toFixed(2)}`);
  }
  console.log(`[receivables] scanned=${invoices.length} enqueued=${enqueued}`);
}

sweepReceivablesChase()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
