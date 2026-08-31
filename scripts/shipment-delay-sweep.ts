import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';
import { enqueueAction } from '../src/lib/action-queue';
import { MILESTONE_LABELS, MILESTONE_ORDER } from '../src/lib/shipment-milestones';

/**
 * Shipment delay sweep (ROADMAP §7.2): finds active orders with a shipment milestone whose plannedAt has
 * passed without an actualAt, and surfaces one `delay_alert` action per order in the cross-department
 * Action Queue (SHIP). L1 — the founder approves before any buyer-facing delay notice goes out.
 *
 * Run nightly (see .github/workflows/shipment-delay-sweep.yml). Same convention as the billing/
 * compliance/receivables sweeps: Postgres table + polling, no queue infra.
 *
 * "Delayed" = milestone.plannedAt < now && milestone.actualAt == null on an order that is not
 * delivered/cancelled. No new schema fields — derived entirely from ShipmentMilestone.
 *
 * Dedup: dedupeKey is `shipment_delay:<orderId>:<earliest overdue milestone type>:w<weeks overdue>`.
 * A still-delayed shipment does not re-fire every night, but the alert re-fires when the situation
 * changes — the delay grows by another week (bucket moves) or a different milestone becomes the
 * earliest slipped one (e.g. the late milestone is completed but the next one slips too).
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function sweepShipmentDelays() {
  const now = new Date();
  const overdue = await prisma.shipmentMilestone.findMany({
    where: {
      actualAt: null,
      plannedAt: { lt: now },
      order: { status: { notIn: ['delivered', 'cancelled'] } },
    },
    include: { order: { include: { buyer: true } } },
    orderBy: [{ tenantId: 'asc' }, { plannedAt: 'asc' }],
  });

  // One alert per order, anchored on the earliest slipped milestone in canonical milestone order.
  const byOrder = new Map<string, typeof overdue>();
  for (const m of overdue) {
    const list = byOrder.get(m.orderId) ?? [];
    list.push(m);
    byOrder.set(m.orderId, list);
  }

  let alerted = 0;
  for (const milestones of byOrder.values()) {
    milestones.sort((a, b) => MILESTONE_ORDER.indexOf(a.type) - MILESTONE_ORDER.indexOf(b.type));
    const anchor = milestones[0];
    const order = anchor.order;
    const daysLate = Math.floor((now.getTime() - anchor.plannedAt!.getTime()) / (24 * 60 * 60 * 1000));
    const weekBucket = Math.floor((now.getTime() - anchor.plannedAt!.getTime()) / WEEK_MS);
    const label = MILESTONE_LABELS[anchor.type];
    const buyerName = order.buyer?.name ?? 'the buyer';
    const others = milestones.length - 1;
    const dedupeKey = `shipment_delay:${order.id}:${anchor.type}:w${weekBucket}`;

    // Skip entirely (action + event) while this exact alert is still pending — enqueueAction would dedupe
    // the queue item anyway, but without this check we'd re-log a DomainEvent every night.
    const pending = await prisma.actionQueueItem.findFirst({
      where: { tenantId: anchor.tenantId, dedupeKey, status: 'pending' },
      select: { id: true },
    });
    if (pending) continue;

    await enqueueAction({
      tenantId: anchor.tenantId,
      kind: 'delay_alert',
      department: 'SHIP',
      title: `Shipment delay — ${order.orderNumber} (${label} ${daysLate}d late)`,
      summary:
        `"${label}" was planned for ${anchor.plannedAt!.toISOString().slice(0, 10)} and is ${daysLate}d overdue` +
        (others > 0 ? ` (${others} more milestone${others === 1 ? '' : 's'} also slipped)` : '') +
        `. Approve a delay update to ${buyerName} or correct the milestone dates.`,
      linkedType: 'order',
      linkedId: order.id,
      dedupeKey,
      isDemo: order.isDemo,
    });

    await writeDomainEvent(prisma, {
      tenantId: anchor.tenantId,
      type: 'shipment.delay_alert',
      refId: order.id,
      payload: {
        orderNumber: order.orderNumber,
        milestoneType: anchor.type,
        plannedAt: anchor.plannedAt!.toISOString(),
        daysLate,
        weekBucket,
        overdueMilestones: milestones.map((m) => m.type),
      },
    });
    alerted += 1;
    console.log(
      `[shipment-delay] tenant=${anchor.tenantId} order=${order.orderNumber} milestone=${anchor.type} late=${daysLate}d slipped=${milestones.length}`,
    );
  }
  console.log(`[shipment-delay] overdueMilestones=${overdue.length} orders=${byOrder.size} alerted=${alerted}`);
}

sweepShipmentDelays()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
