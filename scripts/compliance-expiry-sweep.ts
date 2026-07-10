import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';
import { complianceStatus, alertWindowStart } from '../src/lib/compliance-deadlines';

/**
 * Compliance vault expiry sweep (PRODUCT_PLAN §16): finds ComplianceItems that are expired or inside
 * their renewalLeadDays window and emits one `compliance.expiry_alert` DomainEvent per item per window.
 *
 * Run nightly (see .github/workflows/compliance-expiry-sweep.yml). Same convention as
 * scripts/billing-lifecycle-sweep.ts: Postgres table + polling worker, no queue infra.
 *
 * Dedup: an item is alerted at most once per alert window. `lastAlertedAt` is compared against the
 * window start (expiresAt - renewalLeadDays); when a renewal pushes expiresAt out, the window moves
 * and the item becomes alertable again. No re-nagging for still-expired items — the dashboard banner
 * and funnel alerts keep those visible continuously.
 *
 * Deliberately NOT wired: email digest — no email provider is configured yet (same gap the billing
 * sweep and ROADMAP.md note). Alerts are logged as DomainEvents so a notifier can consume them
 * without touching this sweep once a provider exists.
 */

async function sweepComplianceExpiry() {
  const items = await prisma.complianceItem.findMany({
    where: { expiresAt: { not: null } },
    orderBy: [{ tenantId: 'asc' }, { expiresAt: 'asc' }],
  });

  let alerted = 0;
  for (const item of items) {
    const expiresAt = item.expiresAt!;
    const status = complianceStatus(expiresAt, item.renewalLeadDays);
    if (status !== 'expired' && status !== 'expiring_soon') continue;

    const windowStart = alertWindowStart(expiresAt, item.renewalLeadDays);
    if (item.lastAlertedAt && item.lastAlertedAt >= windowStart) continue; // already alerted for this window

    await prisma.$transaction(async (tx) => {
      await writeDomainEvent(tx, {
        tenantId: item.tenantId,
        type: 'compliance.expiry_alert',
        refId: item.id,
        payload: {
          name: item.name,
          category: item.category,
          status,
          expiresAt: expiresAt.toISOString(),
          renewalLeadDays: item.renewalLeadDays,
        },
      });
      await tx.complianceItem.update({ where: { id: item.id }, data: { lastAlertedAt: new Date() } });
    });
    alerted += 1;
    console.log(`[compliance] tenant=${item.tenantId} item=${item.name} status=${status} expires=${expiresAt.toISOString().slice(0, 10)}`);
  }
  console.log(`[compliance] scanned=${items.length} alerted=${alerted}`);
}

sweepComplianceExpiry()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
