# Spec: Document Engine (L2 doc-sets + CountryPack foundation)

The highest-leverage build in VISION_1B (§2 L2) and GTM's 2027Q2 launch moment. Turns today's `ExportDocument` module (types: PROFORMA | COMMERCIAL_INVOICE | PACKING_LIST | COO | SHIPPING_BILL | BL_DRAFT | LC_DOC | CERT) into a one-click, cross-validated, versioned **doc-set generator** — priced per set (engine 2).

---

## 1. Architecture: three layers, strictly separated

```
┌ Data layer    ─ DocContext: one typed snapshot assembled per order/shipment
├ Template layer ─ CountryPack-owned templates: (DocContext) → DocModel → PDF/print
└ Validation layer ─ rule engine + AI consistency pass over the whole set
```

**Rule zero (VISION_1B §10):** no template hardcodes India. Everything jurisdiction-specific lives in a pack (see COUNTRY_PACK_SPEC). India is `packs/in/` — the first pack, not the default code path.

### 1.1 DocContext (the single source every template reads)
`src/lib/doc-engine/context.ts` — `buildDocContext(orderId)` assembles: tenant profile (legal name, address, IEC, GST, AD code, bank), buyer/consignee, order + line items (HS codes, qty, unit prices, currency), shipment (incoterm, ports, vessel, containers), packing (cartons, weights, volumes), LC terms if present, compliance refs (LUT no., RCMP). Zod-validated; **missing required fields fail fast with a fix-list** ("Add your AD code → Settings") — this is the UX, not an error page. Context is immutable per generation run and stored (JSON) with the doc-set for reproducibility.

### 1.2 Templates
Each doc type = `{ id, requiredFields: (keyof DocContext paths)[], build(ctx): DocModel, render(model): PDF }`. DocModel is a typed intermediate (never template → PDF directly) so validation and AI can read what will print. PDF via `@react-pdf/renderer` (anabyn linecard precedent). Numbering: per-tenant sequences (`PI-2026-0042`) via a counter table with tx-safe increment.

### 1.3 Doc-set generation flow
`generateDocSet(orderId, docTypes[])`:
1. Build + validate context → fix-list if incomplete.
2. Build all DocModels.
3. **Deterministic rule pass** (§2) → errors/warnings.
4. **AI consistency pass** (§3) → findings with citations.
5. Persist: `DocSet` row + `ExportDocument` rows (version++, status `draft`), findings attached.
6. Meter event `docset.generated` (billing, AI_PLATFORM §5).
7. UI: review screen — docs side-by-side, findings panel, approve-all or per-doc; approval stamps `status: approved`, locks version.

Regeneration after order edits = new version; diff view against previous (field-level, from DocModels).

## 2. Deterministic validation rules (cheap, run first)

Cross-doc invariants coded as pure functions over `DocModel[]` — each rule: `{ id, severity, docs, check, message, packId? }`. Core set (~30 rules to start):
- Totals: CI total = Σ line items; PL net ≤ gross weight; carton count × per-carton qty = shipped qty; CI qty = PL qty per line.
- Identity: consignee/notify identical across CI/PL/BL-draft; currency uniform; incoterm on CI matches order.
- India pack rules: GST invoice fields present when LUT, IEC format `^[0-9]{10}$`, HS 8-digit on shipping-bill data, FOB value consistency CI↔shipping bill.
- LC rules (when LC linked): beneficiary matches LC field 59, latest-shipment/expiry dates vs planned SOB, partial-shipment flag vs order plan, description-of-goods verbatim match tolerance.

## 3. AI consistency pass

After rules pass, one structured AI call per doc-set: input = DocModels + LC text (if any) + pack knowledge snippets; output schema = `findings: [{docType, field, severity, issue, suggestion, citation}]`. Prompt versioned in `src/ai/prompts/doc-consistency/`. The AI looks for what rules can't: description mismatches in meaning, suspicious values (unit price order-of-magnitude), missing docs for the destination ("Saudi Arabia typically requires SASO — not in this set"), LC soft-clause traps. **AI never edits documents** — it only files findings; human accepts a suggestion → field updates → regenerate.

## 4. Golden-file eval harness (the moat; build WITH v1, not after)

`src/tests/doc-engine/golden/` — per scenario: `context.json` + expected `docmodels/*.json` + expected `findings.json`. Sources: design-partner real shipments (anonymized, per their agreement), deliberately-broken variants (each rule gets a violating fixture), historical customs-rejection cases as they're collected (CS track feeds these). CI: rule pass is exact-match; AI pass scored (precision/recall on findings) nightly, not blocking, tracked over time — this trendline is the published accuracy metric (VISION_1B §3) and, later, the actuarial basis of the insurance guarantee.

## 5. Schema additions
`DocSet { id, tenantId, orderId, status draft|approved|superseded, contextSnapshot Json, generatedByUserId, meteredAt }` · `ExportDocument` gains `docSetId`, `docModel Json`, `findings Json` · `DocCounter { tenantId, series, year, next }` · pack tables per COUNTRY_PACK_SPEC.

## 6. Build order
1. DocContext + fix-list UX (valuable alone — "what's missing for this shipment").
2. PI + CI + PL templates via pack interface (the 3rd template is the CountryPack gate — ROADMAP R4).
3. Rule engine + core rules → review screen.
4. COO + shipping-bill data prep; numbering; versioning/diff.
5. AI pass + findings UI.
6. Golden harness + first 20 fixtures.
7. Metering hook + (later) billing gate.

Acceptance: one real design-partner order → complete PI/CI/PL/COO set generated, 2 seeded inconsistencies caught (1 by rules, 1 by AI), approved, PDFs downloaded, regenerated after an order edit with visible diff.
