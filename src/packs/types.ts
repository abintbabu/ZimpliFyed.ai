import type { ComplianceCategory, IncentiveType } from '@prisma/client';
import type { DocContext } from '../lib/doc-engine/context';

/**
 * The CountryPack contract (COUNTRY_PACK_SPEC). A pack is the jurisdiction's
 * answer to: which documents exist, the compliance calendar, incentive schemes,
 * field semantics/validation, and knowledge corpus. Core code stays
 * country-agnostic — anything India-specific lives inside a pack.
 */
export type PackCapabilities = {
  docSets: boolean;
  incentives: boolean;
  complianceCalendar: boolean;
  hsLookup: boolean;
  aiCorpus: 'full' | 'partial' | 'none';
};

export type ComplianceSeedDef = {
  category: ComplianceCategory;
  name: string;
  issuingAuthority?: string;
  renewalLeadDays: number;
};

export type IncentiveSchemeDef = {
  type: IncentiveType;
  label: string;
  /** Resolve a scheme rate (%) for an HS code, if known. */
  rateForHsCode?: (hsCode: string) => number | null;
};

export type FieldValidator = {
  id: string;
  label: string;
  /** Returns null if valid, else an error message. */
  validate: (value: string) => string | null;
};

/**
 * EXPORT_OS_MASTER_PLAN §8.2 — country-pack defaults for TenantSettings, one layer in
 * industry-pack < country-pack < plan-entitlement-clamp < tenant-override. Schema/type only in
 * Wave 0; getTenantSettings()'s layering read path is Wave 1 (TenantSettings ships in Migration D
 * partial, unconsumed until then).
 */
export type CountrySettingsDefaults = {
  commercial: {
    fxBasisDefault: 'cbic' | 'bank' | 'market' | 'manual';
  };
  identity: {
    /** Registration field keys this jurisdiction's doc engine needs (e.g. ['gstin','iec','adCode']
     * for India, ['trn'] for UAE) — settings.identity.registrations is keyed by these. */
    registrationKeys: string[];
    /** India-specific LUT declaration text variants; other packs omit this. */
    lutDeclarations?: string[];
  };
};

export type CountryPack = {
  id: string;
  label: string;
  locale: string;
  currencyDefault: string;
  capabilities: PackCapabilities;
  complianceSeeds: ComplianceSeedDef[];
  incentiveSchemes: IncentiveSchemeDef[];
  fieldValidators: Record<string, FieldValidator>;
  /** Doc template ids this pack registers with the doc engine. */
  documentTypes: string[];
  settingsDefaults: CountrySettingsDefaults;
  /**
   * EXPORT_OS_MASTER_PLAN Wave 1 — jurisdiction-specific statutory content for the two invoice-type
   * DocModels (proforma_invoice/commercial_invoice), computed from the context the generic doc-engine
   * already has (§12's "declarationsByDocType" concept, narrowed to what Wave 1 needs). Keeps
   * src/lib/doc-engine/models.ts pack-neutral by construction — it renders whatever strings a pack
   * hands it and never imports a specific pack. Optional: a pack with no invoice-type statutory
   * content (or not built yet) simply omits this, and models.ts prints nothing extra.
   */
  resolveDocumentExtras?: (ctx: DocContext) => { endorsement?: string; placeOfSupply?: string };
};

/**
 * EXPORT_OS_MASTER_PLAN §8.3 — an industry pack is an onboarding-wizard accelerator, not a
 * taxonomy limit: picking "textiles" pre-fills spec axes, categories, QC defaults and first facts,
 * all editable afterwards. The generic attribute engine (spec axes, Migration A) is the core;
 * industry packs are seed data on top.
 */
export type SpecAxisDataType = 'num' | 'enum' | 'text';

export type SpecAxisDef = {
  key: string;
  label: string;
  unit?: string;
  dataType: SpecAxisDataType;
  options?: string[];
  sortOrder: number;
  required: boolean;
};

export type CategoryDef = {
  name: string;
  slug: string;
  sortOrder: number;
};

export type IndustryPricingMethod = 'per_piece' | 'per_kg' | 'per_meter' | 'per_sqm' | 'per_unit';

export type IndustryPack = {
  id: string;
  label: string;
  specAxes: SpecAxisDef[];
  defaultCategories: CategoryDef[];
  uoms: string[];
  pricingMethodDefault: IndustryPricingMethod;
  qcDefaults: {
    aqlLevel: string;
    inspectionLevel: string;
    stages: string[];
  };
  docVocabulary: Record<string, string>;
  promptFragments: {
    productDescription: string;
    specQuestions: string;
    escalationExtras: string[];
  };
  factTemplates: { category: string; template: string }[];
};
