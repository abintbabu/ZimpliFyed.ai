'use client';

import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { AppShell } from './app-shell';
import { BillingLockScreen } from '@/components/billing-lock-screen';
import type { AppNavItem } from './types';
import type { TenantStatus } from '@prisma/client';

const LOCKED_STATUSES: TenantStatus[] = ['suspended', 'pending_deletion', 'deleted'];
const BILLING_PATH = '/dashboard/settings/billing';

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
  const locked = LOCKED_STATUSES.includes(tenantStatus) && pathname !== BILLING_PATH;

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
