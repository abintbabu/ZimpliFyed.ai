'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createLocalStorageFlag } from '@/lib/local-storage-flag';
import { DarkModeToggle } from './dark-mode-toggle';
import { isPathActive, isSectionOpen, type AppNavItem } from './types';

const collapseFlag = createLocalStorageFlag('simplifi-sidebar-collapsed');

export function useSidebarCollapse() {
  const { value: collapsed, toggle } = collapseFlag.useFlag();
  return { collapsed, toggle };
}

function navActiveClasses(isActive: boolean) {
  return isActive
    ? 'bg-brand text-white shadow-sm'
    : 'text-ink/60 dark:text-gray-400 hover:bg-ink/5 dark:hover:bg-white/5 hover:text-ink dark:hover:text-white';
}

function navIconClasses(isActive: boolean) {
  return isActive ? 'text-white' : 'opacity-60';
}

export function AppNavLinks({
  navItems,
  collapsed = false,
  onNavigate,
}: {
  navItems: AppNavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(item => {
        const { label, href, icon: Icon, exact, children, badge } = item;
        const sectionOpen = isSectionOpen(pathname, item);
        const isActive = isPathActive(pathname, href, exact) || sectionOpen;

        return (
          <div key={label}>
            <Link
              href={href}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                collapsed && 'justify-center px-2',
                navActiveClasses(isActive)
              )}
            >
              <div className="relative shrink-0">
                <Icon className={cn('w-4 h-4', navIconClasses(isActive))} />
                {badge && badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{label}</span>
                  {children && (
                    <ChevronRight
                      className={cn(
                        'w-3 h-3 shrink-0 transition-transform',
                        sectionOpen && 'rotate-90',
                        isActive ? 'text-white/60' : 'opacity-30'
                      )}
                    />
                  )}
                </>
              )}
            </Link>
            {!collapsed && children && sectionOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-line dark:border-white/5 pl-2">
                {children.map(child => {
                  const childActive = isPathActive(pathname, child.href);
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        childActive
                          ? 'bg-brand-soft dark:bg-brand/20 text-brand'
                          : 'text-muted dark:text-gray-500 hover:text-ink dark:hover:text-gray-200 hover:bg-ink/5 dark:hover:bg-white/5'
                      )}
                    >
                      <ChevronRight className="w-3 h-3 opacity-40 shrink-0" />
                      <span className="truncate">{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

type AppSidebarProps = {
  navItems: AppNavItem[];
  brandLabel: string;
  brandIcon?: React.ElementType;
  userEmail?: string | null;
  roleLabel?: string;
  isDark: boolean;
  onToggleDark: () => void;
  onLogout: () => void | Promise<void>;
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function AppSidebar({
  navItems,
  brandLabel,
  brandIcon: BrandIcon,
  userEmail,
  roleLabel,
  isDark,
  onToggleDark,
  onLogout,
  collapsed,
  onToggleCollapse,
}: AppSidebarProps) {
  return (
    <aside className={cn(
      'hidden lg:flex shrink-0 sticky top-0 h-screen flex-col bg-white dark:bg-gray-900 border-r border-line dark:border-gray-700/50 transition-[width] duration-200',
      collapsed ? 'w-[64px]' : 'w-60'
    )}>
      <div className={cn(
        'px-3 pt-5 pb-3 border-b border-line dark:border-gray-700/50 flex items-center gap-2',
        collapsed && 'justify-center px-2'
      )}>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {BrandIcon && <BrandIcon className="w-3.5 h-3.5 text-brand shrink-0" />}
              <p className="text-[10px] font-bold text-brand uppercase tracking-widest">{brandLabel}</p>
            </div>
            {userEmail && <p className="text-xs font-semibold text-ink dark:text-white truncate">{userEmail}</p>}
            {roleLabel && <p className="text-[10px] text-muted capitalize mt-0.5">{roleLabel}</p>}
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-lg text-ink/40 dark:text-gray-500 hover:text-ink dark:hover:text-white hover:bg-ink/5 dark:hover:bg-white/5 transition-all"
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <AppNavLinks navItems={navItems} collapsed={collapsed} />
      </nav>

      <div className={cn(
        'px-2 py-3 border-t border-line dark:border-gray-700/50 space-y-0.5',
        collapsed && 'flex flex-col items-center'
      )}>
        <DarkModeToggle isDark={isDark} onToggle={onToggleDark} compact={collapsed} />
        <button
          onClick={onLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all',
            collapsed && 'justify-center w-full p-2'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
