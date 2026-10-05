'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { AppNavItem } from './types';

/** `g` then a letter jumps to a module. Keyed by href so the chord follows the nav, not the label. */
export const NAV_CHORDS: Record<string, string> = {
  '/dashboard': 'd',
  '/dashboard/inbox': 'm',
  '/dashboard/action-queue': 'a',
  '/dashboard/leads': 'l',
  '/dashboard/buyers': 'b',
  '/dashboard/products': 'p',
  '/dashboard/vendors': 'v',
  '/dashboard/rfqs': 'r',
  '/dashboard/quotes': 'q',
  '/dashboard/orders': 'o',
  '/dashboard/shipments': 's',
  '/dashboard/invoices': 'i',
  '/dashboard/expenses': 'e',
  '/dashboard/compliance': 'c',
  '/dashboard/tasks': 't',
};

const CHORD_WINDOW_MS = 1200;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Registers the g-chords for the modules the signed-in role can actually see (`navItems` is already
 * permission-filtered). Ignored while typing, with modifier keys held, or while a dialog is open.
 */
export function NavShortcuts({ navItems }: { navItems: AppNavItem[] }) {
  const router = useRouter();

  useEffect(() => {
    const byKey = new Map<string, string>();
    for (const item of navItems) {
      const key = NAV_CHORDS[item.href];
      if (key) byKey.set(key, item.href);
    }

    let armedAt = 0;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();

      if (armedAt && Date.now() - armedAt <= CHORD_WINDOW_MS) {
        armedAt = 0;
        const href = byKey.get(key);
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }
      if (key === 'g') armedAt = Date.now();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navItems, router]);

  return null;
}
