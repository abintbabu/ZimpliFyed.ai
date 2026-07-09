'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { NAV_ICONS, type NavIconName } from './nav-icons';
import type { AppNavItem } from './types';

type PaletteItem = { label: string; href: string; icon: NavIconName };

function flattenNav(items: AppNavItem[]): PaletteItem[] {
  return items.flatMap((item) => [
    { label: item.label, href: item.href, icon: item.icon },
    ...(item.children?.map((c) => ({ label: `${item.label} / ${c.label}`, href: c.href, icon: item.icon })) ?? []),
  ]);
}

export function CommandPalette({ navItems }: { navItems: AppNavItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const flatItems = useMemo(() => flattenNav(navItems), [navItems]);
  const results = useMemo(() => {
    if (!query.trim()) return flatItems.slice(0, 8);
    const q = query.toLowerCase();
    return flatItems.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
  }, [flatItems, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[15vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-canvas shadow-[var(--shadow-popover)] dark:bg-surface">
        <div className="flex items-center gap-3 border-b border-line-soft px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && results[activeIndex]) {
                go(results[activeIndex].href);
              }
            }}
            placeholder="Jump to a module…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">No matches for &ldquo;{query}&rdquo;</p>
          )}
          {results.map((item, i) => {
            const Icon = NAV_ICONS[item.icon];
            const active = i === activeIndex;
            return (
              <button
                key={item.href}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => go(item.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-surface'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-white' : 'opacity-60'}`} />
                <span className="flex-1 truncate font-medium">{item.label}</span>
                {active && <CornerDownLeft className="h-3.5 w-3.5 opacity-70" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteHint() {
  return (
    <span className="hidden items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted lg:inline-flex">
      <span className="text-xs">⌘</span>K
    </span>
  );
}
