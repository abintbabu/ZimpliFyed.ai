import type { IndustryPack } from '../../types';

/**
 * EXPORT_OS_MASTER_PLAN §8.3 — the no-taxonomy default. A tenant that starts generic gets a
 * usable but empty attribute engine: no pre-filled spec axes or categories, so the onboarding
 * wizard falls back to the tenant defining their own from a blank slate.
 */
export const genericIndustryPack: IndustryPack = {
  id: 'generic',
  label: 'Generic',
  specAxes: [],
  defaultCategories: [],
  uoms: ['pcs', 'kg', 'set', 'box'],
  pricingMethodDefault: 'per_piece',
  qcDefaults: {
    aqlLevel: '2.5',
    inspectionLevel: 'II',
    stages: ['final'],
  },
  docVocabulary: {},
  promptFragments: {
    productDescription: 'Describe the product in plain terms: what it is, its key specifications, and its typical use case.',
    specQuestions: 'Ask the buyer for any specification needed to quote accurately that is missing from the enquiry.',
    escalationExtras: [],
  },
  factTemplates: [],
};
