import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';
import { enqueueAction } from '../src/lib/action-queue';
import { lcDeadlineAlerts, type LcDeadlineKind } from '../src/lib/lc-deadlines';

/**
 * LC deadline sweep (M3): finds open letters of credit whose latest shipment date or expiry is inside the
 * alert window (or already past) and surfaces one `lc_deadline` action per LC per deadline in the Action
 * Queue (COMPLY). Run nightly, same convention as the other sweeps (see .github/workflows).
 *
 * Dedup: dedupeKey is `lc_deadline:<lcId>:<kind>:<date>:<band>`. A still-open deadline does not re-fire
 * every night, but it escalates once as it crosses each band (14 days → 3 days → overdue), and a
 * date moved by an LC amendment starts a fresh series.
 */

const KIND_LABEL: Record<LcDeadlineKind, string> = { shipment: 'latest shipment date', expiry: 'expiry' };

async function sweepLcDeadlines() {
  const now = new Date();
  // tenant-safe: cross-tenant sweep by design
  const lcs = await prisma.letterOfCredit.findMany({
    where: { status: { in: ['draft', 'advised', 'amended'] }, OR: [{ expiryDate: { not: null } }, { latestShipmentDate: { not: null } }] },
    include: { order: { select: { id: true, orderNumber: true, status: true } } },
  });

  let alerted = 0;
  for (const lc of lcs) {
    const shipped = ['shipped', 'in_transit', 'delivered'].includes(lc.order.status);
    for (const a of lcDeadlineAlerts(lc, shipped, now)) {
      const dateStr = a.date.toISOString().slice(0, 10);
      const when = a.overdue ? `passed ${-a.daysLeft} day(s) ago` : a.daysLeft === 0 ? 'is today' : `is in ${a.daysLeft} day(s)`;
      await enqueueAction({
        tenantId: lc.tenantId,
        kind: 'lc_deadline',
        department: 'COMPLY',
        title: `LC ${lc.lcNumber ?? ''} ${KIND_LABEL[a.kind]}: ${dateStr}`.replace('  ', ' '),
        summary: `The ${KIND_LABEL[a.kind]} on the letter of credit for order ${lc.order.orderNumber} ${when}.${
          a.kind === 'shipment' ? ' Shipping after this date makes the documents discrepant — ask the buyer for an amendment now.' : ' Documents must reach the bank before this date.'
        }`,
        linkedType: 'order',
        linkedId: lc.order.id,
        dedupeKey: `lc_deadline:${lc.id}:${a.kind}:${dateStr}:${a.band}`,
      });
      await prisma.$transaction(async (tx) => {
        await writeDomainEvent(tx, {
          tenantId: lc.tenantId,
          type: 'lc.deadline_alert',
          refId: lc.id,
          payload: { orderId: lc.order.id, kind: a.kind, date: a.date.toISOString(), daysLeft: a.daysLeft, band: a.band },
        });
        await tx.letterOfCredit.update({ where: { id: lc.id, tenantId: lc.tenantId }, data: { lastAlertedAt: new Date() } });
      });
      alerted += 1;
      console.log(`[lc] tenant=${lc.tenantId} lc=${lc.id} ${a.kind} ${dateStr} band=${a.band}`);
    }
  }
  console.log(`[lc] scanned=${lcs.length} alerted=${alerted}`);
}

sweepLcDeadlines()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
