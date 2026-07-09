import type { CountryPack, PackCapabilities } from './types';
import { indiaPack } from './in';

/**
 * Static pack registry (COUNTRY_PACK_SPEC §2): import map, not dynamic loading —
 * a new pack is a PR. `getPack` never throws for the default; unknown ids fall
 * back to India until more packs ship.
 */
const PACKS: Record<string, CountryPack> = {
  in: indiaPack,
};

export const DEFAULT_PACK_ID = 'in';

export function getPack(packId: string | null | undefined): CountryPack {
  return PACKS[packId ?? DEFAULT_PACK_ID] ?? PACKS[DEFAULT_PACK_ID];
}

export function assertPackCapability(packId: string, capability: keyof PackCapabilities): void {
  const cap = getPack(packId).capabilities[capability];
  if (!cap || cap === 'none') {
    throw new Error(`pack_capability_unavailable:${packId}:${capability}`);
  }
}

export function listPacks(): CountryPack[] {
  return Object.values(PACKS);
}
