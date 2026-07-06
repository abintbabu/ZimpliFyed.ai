'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** A boolean flag persisted to localStorage and read via useSyncExternalStore
 *  so the initial client render matches SSR (false) without an effect-driven
 *  setState, and stays in sync across multiple mounted consumers/tabs. */
export function createLocalStorageFlag(key: string) {
  const listeners = new Set<() => void>();

  function get(): boolean {
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  }

  function set(value: boolean) {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
    listeners.forEach((l) => l());
  }

  function subscribe(callback: () => void) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  function useFlag() {
    const value = useSyncExternalStore(subscribe, get, () => false);
    const setValue = useCallback((next: boolean) => set(next), []);
    const toggle = useCallback(() => set(!get()), []);
    return { value, setValue, toggle };
  }

  return { useFlag };
}
