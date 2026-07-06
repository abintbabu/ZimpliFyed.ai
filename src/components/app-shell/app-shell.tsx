'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar, useSidebarCollapse } from './app-sidebar';
import { AppMobileNav } from './app-mobile-nav';
import { trackAppPath } from './back-button';
import { usePanelTheme } from './use-panel-theme';
import type { AppNavItem } from './types';

type AppShellProps = {
  navItems: AppNavItem[];
  brandLabel: string;
  brandIcon?: React.ElementType;
  userEmail?: string | null;
  roleLabel?: string;
  onLogout: () => void | Promise<void>;
  children: React.ReactNode;
};

export function AppShell({
  navItems,
  brandLabel,
  brandIcon,
  userEmail,
  roleLabel,
  onLogout,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const { isDark, toggle } = usePanelTheme();
  const { collapsed, toggle: toggleCollapse } = useSidebarCollapse();

  useEffect(() => {
    trackAppPath(pathname);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-surface dark:bg-gray-950">
      <AppSidebar
        navItems={navItems}
        brandLabel={brandLabel}
        brandIcon={brandIcon}
        userEmail={userEmail}
        roleLabel={roleLabel}
        isDark={isDark}
        onToggleDark={toggle}
        onLogout={onLogout}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />

      <AppMobileNav
        navItems={navItems}
        brandLabel={brandLabel}
        isDark={isDark}
        onToggleDark={toggle}
        onLogout={onLogout}
      />

      <main className="flex-1 min-w-0 overflow-x-clip px-4 lg:px-8 pb-10 pt-[76px] lg:pt-8">
        {children}
      </main>
    </div>
  );
}
