'use client';

import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { AppShell } from './app-shell';
import { BillingLockScreen } from '@/components/billing-lock-screen';
import type { AppNavItem } from './types';
import type { TenantStatus } from '@prisma/client';

// Must stay in step with BLOCKED_STATUSES in src/lib/session-tenant.ts, which is where the real
// enforcement lives — this constant only decides what the shell *shows*. Until the server-side
// gate existed, a locked tenant's pages were still fetched and serialised to the client and merely
// covered by the lock screen; now requireTenantSession() refuses them outright and this is cosmetic.
const LOCKED_STATUSES: TenantStatus[] = ['suspended', 'pending_deletion', 'deleted'];

// The surfaces a locked tenant must still reach: billing (to pay and reactivate) and data export
// (DPDP data-principal right, which survives suspension). Both pass `allowSuspended` at the
// chokepoint, so exempting them here matches what the server will actually serve.
const UNLOCKED_PATHS = ['/dashboard/settings/billing', '/dashboard/settings/export'];

export function DashboardShell({
  navItems,
  userEmail,
  roleLabel,
  tenantStatus,
  isOwner,
  children,
}: {
  navItems: AppNavItem[];
  userEmail?: string | null;
  roleLabel?: string;
  tenantStatus: TenantStatus;
  isOwner: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const locked = LOCKED_STATUSES.includes(tenantStatus) && !UNLOCKED_PATHS.includes(pathname);

  return (
    <AppShell
      navItems={navItems}
      brandLabel="Zimplifyed AI"
      userEmail={userEmail}
      roleLabel={roleLabel}
      onLogout={() => signOut({ callbackUrl: '/' })}
    >
      {locked ? <BillingLockScreen status={tenantStatus} isOwner={isOwner} /> : children}
    </AppShell>
  );
}
