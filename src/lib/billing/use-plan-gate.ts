'use client';

import { useCallback, useState } from 'react';
import { parsePlanGateError } from './plan-gate-client';
import type { Feature } from './plans';

/** Drop-in error-catch helper for gated actions: pass a caught `err` to `tryOpenFromError`; if it's a
 * plan-gate error it opens the shared UpsellSheet and returns true (so the caller can skip its own error UI). */
export function usePlanGate() {
  const [gate, setGate] = useState<Feature | null>(null);

  const tryOpenFromError = useCallback((err: unknown): boolean => {
    const feature = parsePlanGateError(err);
    if (feature) {
      setGate(feature);
      return true;
    }
    return false;
  }, []);

  return { gate, tryOpenFromError, close: () => setGate(null) };
}
