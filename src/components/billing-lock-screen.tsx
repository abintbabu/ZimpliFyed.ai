import Link from 'next/link';
import type { TenantStatus } from '@prisma/client';

const COPY: Record<'suspended' | 'pending_deletion' | 'deleted', { title: string; body: string }> = {
  suspended: {
    title: 'This workspace is suspended',
    body: 'Payment is past due. Your data is safe and nothing has been deleted — reactivate billing to restore access.',
  },
  pending_deletion: {
    title: 'This workspace is scheduled for deletion',
    body: 'Payment has been overdue for a while. Reactivate billing now to cancel the scheduled deletion — your data is still intact.',
  },
  deleted: {
    title: 'This workspace has been deactivated',
    body: 'Contact us if you believe this is a mistake or want to recover your data.',
  },
};

/** Lifecycle lock screen (BILLING_SPEC §3): renders instead of the dashboard for suspended/pending_deletion/
 * deleted tenants. Owners get the billing CTA; everyone else gets a friendly notice — data access is blocked,
 * never deleted, for non-payment. */
export function BillingLockScreen({ status, isOwner }: { status: TenantStatus; isOwner: boolean }) {
  const copy = COPY[status as 'suspended' | 'pending_deletion' | 'deleted'];

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-white p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">{copy.title}</h1>
        <p className="mt-3 text-sm text-muted">{copy.body}</p>
        {isOwner ? (
          <Link
            href="/dashboard/settings/billing"
            className="mt-6 inline-block rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-white"
          >
            Go to billing
          </Link>
        ) : (
          <p className="mt-6 text-xs text-muted">Ask your workspace owner or admin to update billing.</p>
        )}
      </div>
    </div>
  );
}
