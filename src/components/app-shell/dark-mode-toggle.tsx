'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  isDark: boolean;
  onToggle: () => void;
  compact?: boolean;
  className?: string;
};

export function DarkModeToggle({ isDark, onToggle, compact = false, className }: Props) {
  return (
    <button
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex items-center gap-3 rounded-xl text-sm font-medium transition-all',
        compact
          ? 'p-2 text-ink dark:text-gray-300 hover:bg-ink/5 dark:hover:bg-white/5'
          : 'px-3 py-2.5 w-full text-muted dark:text-gray-400 hover:bg-ink/5 dark:hover:bg-white/5 hover:text-ink dark:hover:text-white',
        className
      )}
    >
      {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
      {!compact && (isDark ? 'Light mode' : 'Dark mode')}
    </button>
  );
}
