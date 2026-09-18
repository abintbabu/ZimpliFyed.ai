import type { IndustryPack } from '../../types';

/**
 * EXPORT_OS_MASTER_PLAN §8.3 — where Anabyn's textile domain content lands: the prompt *shape*
 * stays generic (src/ai), the *content* is injected from this pack. Picking "textiles" at
 * onboarding pre-fills spec axes, categories, QC defaults and first facts; all editable
 * afterwards, and the pack is never consulted again at runtime.
 */
export const textilesIndustryPack: IndustryPack = {
  id: 'textiles',
  label: 'Textiles',
  specAxes: [
    { key: 'gsm', label: 'GSM', unit: 'g/m²', dataType: 'num', sortOrder: 1, required: true },
    { key: 'thread_count', label: 'Thread Count', unit: 'TC', dataType: 'num', sortOrder: 2, required: false },
    {
      key: 'composition', label: 'Fabric Composition', dataType: 'enum', sortOrder: 3, required: true,
      options: ['100% Cotton', 'Cotton-Poly Blend', 'Linen', 'Microfiber', 'Bamboo', 'Terry'],
    },
    {
      key: 'weave', label: 'Weave Type', dataType: 'enum', sortOrder: 4, required: false,
      options: ['Plain', 'Twill', 'Satin', 'Waffle', 'Jacquard', 'Terry'],
    },
    { key: 'size', label: 'Size', dataType: 'text', sortOrder: 5, required: false },
    { key: 'color', label: 'Color', dataType: 'text', sortOrder: 6, required: false },
  ],
  defaultCategories: [
    { name: 'Bath', slug: 'bath', sortOrder: 1 },
    { name: 'Bed', slug: 'bed', sortOrder: 2 },
    { name: 'Kitchen', slug: 'kitchen', sortOrder: 3 },
    { name: 'Spa & Wellness', slug: 'spa', sortOrder: 4 },
  ],
  uoms: ['pcs', 'kg', 'set', 'dozen'],
  pricingMethodDefault: 'per_piece',
  qcDefaults: {
    aqlLevel: '2.5',
    inspectionLevel: 'II',
    stages: ['pre_production', 'inline', 'final', 'loading'],
  },
  docVocabulary: {
    'entity.buyer': 'Buyer',
    'entity.product': 'Item',
  },
  promptFragments: {
    productDescription: 'Describe the textile product: fabric composition, GSM, weave, size and any finishing (e.g. hemmed, embroidered).',
    specQuestions: 'Ask for GSM, composition, size and colour if the buyer has not already specified them — these are the axes that drive pricing.',
    escalationExtras: [
      'A buyer asking for a GSM or composition outside the tenant\'s usual range needs a human quote, not an automated one.',
    ],
  },
  factTemplates: [
    { category: 'moq', template: 'Minimum order quantity is {value} pieces per item.' },
    { category: 'lead_time', template: 'Standard production lead time is {value} days from order confirmation.' },
    { category: 'certification', template: 'Products are available in {value}-certified variants on request.' },
  ],
};
