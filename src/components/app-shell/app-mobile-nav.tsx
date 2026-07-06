'use client';

import React, { useState } from 'react';
import { Menu, X, LogOut } from 'lucide-react';
import { AppNavLinks } from './app-sidebar';
import { DarkModeToggle } from './dark-mode-toggle';
import type { AppNavItem } from './types';

type AppMobileNavProps = {
  navItems: AppNavItem[];
  brandLabel: string;
  isDark: boolean;
  onToggleDark: () => void;
  onLogout: () => void | Promise<void>;
};

export function AppMobileNav({
  navItems,
  brandLabel,
  isDark,
  onToggleDark,
  onLogout,
}: AppMobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-[60px] bg-white dark:bg-gray-900 border-b border-line dark:border-gray-700/50 flex items-center justify-between px-4 shadow-sm">
        <p className="text-xs font-bold text-ink dark:text-white uppercase tracking-widest">{brandLabel}</p>
        <div className="flex items-center gap-2">
          <DarkModeToggle isDark={isDark} onToggle={onToggleDark} compact />
          <button
            onClick={() => setOpen(o => !o)}
            className="p-2 rounded-xl border border-line dark:border-gray-600 text-ink dark:text-white"
            aria-label="Toggle navigation"
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden fixed top-[60px] left-0 right-0 z-30 bg-white dark:bg-gray-900 border-b border-line dark:border-gray-700/50 shadow-lg px-4 py-3 space-y-1 max-h-[calc(100dvh-60px)] overflow-y-auto">
          <AppNavLinks navItems={navItems} onNavigate={() => setOpen(false)} />
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </>
  );
}
