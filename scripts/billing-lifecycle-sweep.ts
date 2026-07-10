import { prisma } from '../src/lib/prisma';
import { writeDomainEvent } from '../src/lib/domain-events';

/**
 * Tenant lifecycle state machine sweep (BILLING_SPEC §3):
 *   trial(14d) -> active | free-downgrade
 *   active -> past_due -> suspended (day 15 of past_due) -> pending_deletion (day 60 of suspended)
 *   pending_deletion -> deleted (day 7 of pending_deletion)
 *
 * Run nightly (see .github/workflows/billing-lifecycle-sweep.yml). Postgres-table + polling worker per
 * AI_PLATFORM_SPEC §6 convention — no queue infra yet.
 *
 * Deliberately NOT wired: actual dunning email/WhatsApp sends (day 1/4/8 nudges) — no email provider is
 * configured yet (same gap ROADMAP.md notes for magic-link auth). Nudges are logged as `billing.dunning_nudge`
 * DomainEvents so a notifier can be layered on without touching this sweep once one exists.
 *
 * Deliberately NOT automated: the final pending_deletion -> deleted transition here only flips
 * `Tenant.status` — it does NOT run `prisma.tenant.delete()` (which would cascade-erase all tenant data).
 * BILLING_SPEC's "data never deleted for non-payment, only for explicit deletion" plus this codebase's own
 * safety norms around irreversible operations both argue for a human reviewing the list of `deleted`-status
 * tenants before anyone runs an actual hard-delete pass.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function sweepTrials() {
  const expired = await prisma.tenant.findMany({
    where: { status: 'trial', trialEndsAt: { lt: new Date() } },
  });
  for (const tenant of expired) {
    if (tenant.billingProvider) {
      // Already checked out mid-trial — a subscription webhook will have set them active; just clear the marker.
      await prisma.tenant.update({ where: { id: tenant.id }, data: { trialEndsAt: null } });
      continue;
    }
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { plan: 'free', status: 'active', trialEndsAt: null },
    });
    await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.trial_expired' });
    console.log(`[trial] ${tenant.slug}: downgraded to free`);
  }
}

async function sweepDunning() {
  const pastDue = await prisma.tenant.findMany({
    where: { status: 'past_due', pastDueSince: { not: null } },
  });
  for (const tenant of pastDue) {
    const daysPastDue = Math.floor((Date.now() - tenant.pastDueSince!.getTime()) / DAY_MS);

    if (daysPastDue >= 15) {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'suspended', suspendedAt: new Date() } });
      await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.suspended' });
      console.log(`[dunning] ${tenant.slug}: suspended (${daysPastDue}d past due)`);
    } else if ([1, 4, 8].includes(daysPastDue)) {
      await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.dunning_nudge', payload: { day: daysPastDue } });
      console.log(`[dunning] ${tenant.slug}: nudge day ${daysPastDue} (no email provider wired — logged only)`);
    }
  }
}

async function sweepSuspended() {
  const suspended = await prisma.tenant.findMany({
    where: { status: 'suspended', suspendedAt: { lt: new Date(Date.now() - 60 * DAY_MS) } },
  });
  for (const tenant of suspended) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'pending_deletion', pendingDeletionAt: new Date() } });
    await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.pending_deletion' });
    console.log(`[suspended] ${tenant.slug}: moved to pending_deletion (60d suspended)`);
  }
}

async function sweepPendingDeletion() {
  const due = await prisma.tenant.findMany({
    where: { status: 'pending_deletion', pendingDeletionAt: { lt: new Date(Date.now() - 7 * DAY_MS) } },
  });
  for (const tenant of due) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'deleted' } });
    await writeDomainEvent(prisma, { tenantId: tenant.id, type: 'billing.deleted' });
    console.log(`[pending_deletion] ${tenant.slug}: flagged status=deleted — REVIEW MANUALLY before any hard delete`);
  }
}

async function main() {
  await sweepTrials();
  await sweepDunning();
  await sweepSuspended();
  await sweepPendingDeletion();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
