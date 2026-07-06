'use client';

import { useEffect } from 'react';
import { createLocalStorageFlag } from '@/lib/local-storage-flag';

const darkFlag = createLocalStorageFlag('simplifi-panel-theme-dark');

export function usePanelTheme() {
  const { value: isDark, toggle } = darkFlag.useFlag();

  // Apply dark class on <html> so Radix portals (dialogs, dropdowns)
  // rendered on <body> also get dark mode.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  return { isDark, toggle };
}
