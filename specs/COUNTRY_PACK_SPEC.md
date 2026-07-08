# Spec: CountryPack Abstraction (technical contract)

VISION_1B §10 #1: build before the 3rd India-specific doc template. The plugin layer that makes a country launch = data + review, not code. Operational playbook lives in TEAMS §7; this is the engineering contract.

---

## 1. What a pack owns (and nothing else does)
A pack is the jurisdiction-specific answer to five questions:
1. **Documents** — which doc types exist, their templates, numbering conventions, required fields (DOC_ENGINE templates are registered *by* packs).
2. **Compliance calendar** — registrations/licenses (IEC/LUT/RCMC ⇄ ERC/BIN for BD, etc.), renewal cycles, seeded ComplianceItems at org creation.
3. **Incentives** — scheme definitions (RoDTEP/drawback ⇄ cash-incentive schemes elsewhere), rate lookups, claim workflows metadata.
4. **Field semantics & validation** — tax-id formats (GSTIN regex ⇄ BIN), customs field requirements, currency/number/date display norms.
5. **Knowledge** — corpus chunks tagged `packId` (AI_PLATFORM §4): regulations, port procedures, FTA texts; powers citations + M4/M5 content.

**Core stays country-agnostic:** orders, quotes, invoices-as-records, vendors, tasks, money math, RBAC, billing. If a PR adds an `if (country === 'IN')` outside `packs/`, it's wrong.

## 2. Shape (code + data hybrid)
```
src/packs/
  types.ts            // the CountryPack interface
  registry.ts         // getPack(packId), assertPackCapability()
  in/                 // India — first implementation
    index.ts          // manifest: id, currencyDefaults, locale, capabilities
    documents/        // template modules implementing DOC_ENGINE's interface
    rules/            // pack-specific validation rules (DOC_ENGINE §2)
    compliance.ts     // seedable compliance item definitions
    incentives.ts     // scheme defs + rate resolvers
    fields.ts         // tax-id validators, address shapes, label overrides
```
Static registration (import map), not dynamic loading — type safety over plugin dynamism; a new pack is a PR. Reference data with update cadence (duty rates, RoDTEP tables) lives in DB tables keyed by `packId` + `effectiveFrom` (versioned rows, never overwrite — historical doc-sets must reproduce old rates), refreshed by the corpus-ingestion job.

## 3. Tenant binding
`Tenant.packId String @default("in")` set at org creation (wizard asks country of export origin when >1 pack exists; until then implicit). One pack per tenant v1; multi-origin firms (India + Dubai entities) = the multi-entity feature (PRODUCT enhancement backlog) — separate tenants under one owner, not multi-pack tenants.

## 4. Capability flags (packs mature unevenly)
`capabilities: { docSets: boolean, incentives: boolean, complianceCalendar: boolean, hsLookup: boolean, aiCorpus: 'full'|'partial'|'none' }` — UI features render/gate per capability (same pattern as plan gating), so a new pack can launch with docs-only and grow. Launch bar (per TEAMS §7 Gate 1): docSets for the top-5 docs + compliance + fields, local-expert-reviewed.

## 5. Migration path for existing code
1. Create `packs/types.ts` + registry + `in/` skeleton.
2. Move into `in/`: HS-code India specifics, compliance seed definitions (`compliance-deadlines.ts`), incentive types (RODTEP/DRAWBACK enums stay DB-level; scheme logic moves), GSTIN/IEC validators.
3. DOC_ENGINE templates are born inside `in/documents/` (never exist elsewhere).
4. `Tenant.packId` migration, default `in`.
5. Lint guard: no `IN`/`india`/`GST`-specific literals outside `src/packs/` (grep-based CI check with an allowlist).

## 6. Definition of done for a new pack (engineering side)
Manifest + fields + compliance defs + ≥5 doc templates with golden fixtures (DOC_ENGINE §4) + rules + corpus seed (≥100 curated chunks) + i18n strings for pack-specific labels + local-expert sign-off recorded in the PR. Two golden-file suites must pass: the new pack's, and India's unchanged (regression proof that core stayed generic).
