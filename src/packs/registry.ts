import type { CountryPack, IndustryPack, PackCapabilities } from './types';
import { indiaPack } from './in';
import { genericIndustryPack } from './industry/generic';
import { textilesIndustryPack } from './industry/textiles';

/**
 * Static pack registry (COUNTRY_PACK_SPEC §2): import map, not dynamic loading —
 * a new pack is a PR. `getPack` never throws for the default; unknown ids fall
 * back to India until more packs ship.
 *
 * The `ae` (UAE/GCC) country pack is NOT here yet — EXPORT_OS_MASTER_PLAN §8.3/Wave 2, gated on a
 * UAE-based advisor sign-off (§CCO brief). Do not add it from memory.
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

/**
 * IndustryPack registry (§8.3) — same static-import-map discipline as CountryPack, and the same
 * silent-fallback-to-default behavior for an unrecognised id (never throws), for consistency.
 * `generic` and `textiles` ship in Wave 0; `food`/`agri` and `engineering` are next (§15 Wave 3+).
 */
const INDUSTRY_PACKS: Record<string, IndustryPack> = {
  generic: genericIndustryPack,
  textiles: textilesIndustryPack,
};

export const DEFAULT_INDUSTRY_PACK_ID = 'generic';

export function getIndustryPack(industryPackId: string | null | undefined): IndustryPack {
  return INDUSTRY_PACKS[industryPackId ?? DEFAULT_INDUSTRY_PACK_ID] ?? INDUSTRY_PACKS[DEFAULT_INDUSTRY_PACK_ID];
}

export function listIndustryPacks(): IndustryPack[] {
  return Object.values(INDUSTRY_PACKS);
}
