import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getTenantContext } from '@/lib/tenant';
import { DashboardShell } from '@/components/app-shell/dashboard-shell';
import { DASHBOARD_NAV_ITEMS } from '@/components/app-shell/nav-items';
import { isNavVisible } from '@/components/app-shell/types';
import { ROLE_LABELS } from '@/lib/permissions';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const tenant = await getTenantContext();
  if (!tenant) redirect('/login');

  const membership = session.user.memberships.find((m) => m.tenantId === tenant.id);
  if (!membership) redirect('/no-access');

  const visibleItems = DASHBOARD_NAV_ITEMS.filter((item) => isNavVisible(item, membership.role));

  return (
    <DashboardShell
      navItems={visibleItems}
      userEmail={session.user.email}
      roleLabel={ROLE_LABELS[membership.role]}
    >
      {children}
    </DashboardShell>
  );
}
