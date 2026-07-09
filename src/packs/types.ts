import type { ComplianceCategory, IncentiveType } from '@prisma/client';

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
};
