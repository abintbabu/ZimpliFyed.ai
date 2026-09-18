import assert from 'node:assert/strict';
import { getPack, getIndustryPack, listPacks, listIndustryPacks, DEFAULT_INDUSTRY_PACK_ID } from '../../packs/registry';

/**
 * EXPORT_OS_MASTER_PLAN §8.3 — CountryPack.settingsDefaults and the IndustryPack registry
 * (generic + textiles). Pure, no DB: `npx tsx src/tests/packs/registry.test.ts`.
 */

// ── CountryPack.settingsDefaults ────────────────────────────────────────────
const india = getPack('in');
assert.equal(india.settingsDefaults.commercial.fxBasisDefault, 'cbic');
assert.deepEqual(india.settingsDefaults.identity.registrationKeys, ['gstin', 'iec', 'adCode']);
assert.ok(india.settingsDefaults.identity.lutDeclarations!.length >= 2, 'India carries LUT declaration variants');

// getPack never throws for an unregistered id — falls back to the default (India today).
assert.equal(getPack('ae').id, 'in', 'unregistered pack ids fall back to the default, never throw');
assert.equal(getPack(undefined).id, 'in');
assert.ok(listPacks().length >= 1);

// ── IndustryPack registry ───────────────────────────────────────────────────
assert.equal(DEFAULT_INDUSTRY_PACK_ID, 'generic');

const generic = getIndustryPack('generic');
assert.equal(generic.specAxes.length, 0, 'generic ships with no pre-filled spec axes — a blank slate');
assert.equal(generic.defaultCategories.length, 0);

const textiles = getIndustryPack('textiles');
assert.ok(textiles.specAxes.some((a) => a.key === 'gsm'), 'textiles pre-fills GSM as a spec axis');
assert.ok(textiles.defaultCategories.length > 0, 'textiles pre-fills default categories');
assert.equal(textiles.qcDefaults.stages.join(','), 'pre_production,inline,final,loading');

// Same silent-fallback-to-default discipline as getPack — never throws on an unknown id.
assert.equal(getIndustryPack('nonexistent-industry').id, 'generic');
assert.equal(getIndustryPack(null).id, 'generic');
assert.ok(listIndustryPacks().length === 2, 'generic + textiles ship in Wave 0');

console.log('✓ packs/registry: CountryPack.settingsDefaults + IndustryPack registry (generic, textiles)');
