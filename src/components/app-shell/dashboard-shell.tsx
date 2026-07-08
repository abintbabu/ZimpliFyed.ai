'use client';

import { signOut } from 'next-auth/react';
import { AppShell } from './app-shell';
import type { AppNavItem } from './types';

export function DashboardShell({
  navItems,
  userEmail,
  roleLabel,
  children,
}: {
  navItems: AppNavItem[];
  userEmail?: string | null;
  roleLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      navItems={navItems}
      brandLabel="Zimplifyed AI"
      userEmail={userEmail}
      roleLabel={roleLabel}
      onLogout={() => signOut({ callbackUrl: '/' })}
    >
      {children}
    </AppShell>
  );
}
