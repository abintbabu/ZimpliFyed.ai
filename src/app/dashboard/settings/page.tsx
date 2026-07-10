import Link from 'next/link';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { getTenantProfile } from '@/actions/tenant-settings';
import { TenantProfileForm } from './tenant-profile-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { tenantId, role } = await requireTenantSession();
  const canManage = hasPermission(role, 'users:manage');

  const profile = await getTenantProfile(tenantId);
  if (!profile) return <p className="text-sm text-muted">Company not found.</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">Manage your company profile, team, and billing.</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="text-sm font-semibold text-ink">Company profile</p>
        {canManage ? (
          <div className="mt-4">
            <TenantProfileForm
              profile={{
                name: profile.name,
                businessType: profile.businessType,
                exportProducts: profile.exportProducts,
                primaryMarkets: profile.primaryMarkets,
              }}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Only owners and admins can edit company details.</p>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-white p-6">
        <p className="text-sm font-semibold text-ink">Team &amp; billing</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/users" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-black/[0.02]">
            Manage team &amp; roles
          </Link>
          <Link href="/dashboard/settings/billing" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-black/[0.02]">
            Billing &amp; plan
          </Link>
          <Link href="/dashboard/settings/export" className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-black/[0.02]">
            Export data
          </Link>
        </div>
      </div>
    </div>
  );
}
