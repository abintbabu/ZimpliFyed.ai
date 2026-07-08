# Spec: SEO / AEO / GEO Content Engine

Executes GTM §3.1: 2,000+ programmatic pages, 6 free tools, GEO citability — the anabyn playbook re-aimed at SaaS intent. Target: 50% of signups organic-sourced.

---

## 1. Site architecture (marketing app, `(marketing)` group)
```
/                      product story (Export OS)
/pricing               plans + per-outcome comparison table vs CHA fees
/tools/*               free tools (the lead magnets)
/guides/*              pillar content (editorial)
/export/[product]/[country]   programmatic money pages
/hs/[code]             HS-code pages (rate, RoDTEP, docs needed)
/glossary/[term]       definitions (AEO snippets)
/customers/*           case studies       /compare/*  vs alternatives
/security /legal/*     trust + ToS/Privacy
```
Infra day one: sitemap index (segmented, `lastmod` real), llms.txt + llms-full.txt, robots, canonical discipline, OG images generated per page, `FAQPage`/`SoftwareApplication`/`HowTo` schema where truthful (anabyn lesson: **no fake AggregateRating — ever**; add real ratings only when real reviews exist).

## 2. Programmatic matrices (data-driven, one template each)
| Matrix | Pattern | Volume | Data source |
|---|---|---|---|
| M1 docs-by-lane | "Documents required to export {product} to {country}" | 40×25 = 1,000 | pack doc requirements + product list |
| M2 HS pages | "HS {code}: duty, RoDTEP rate, export docs" | 500 top codes | HsCode cache + DGFT schedules |
| M3 how-to | "How to export {product} from India" | 40 | editorial-assisted template |
| M4 country guides | "Exporting to {country}: compliance, ports, payment norms" | 25 | knowledge corpus |
| M5 glossary | LC, e-BRC, RoDTEP, SDF, CTH… | 150 | corpus definitions |
| M6 compare | vs Excel, vs Zoho, vs IndiaMART-after-the-lead | 10 | editorial |
Quality gates (anabyn lessons — **saturation kills**): every page ≥40% unique data (rates, doc lists, port info), AEO answer block up top (2–3 sentence direct answer), 3+ contextual internal links via a link-graph module (port the internal-links pattern), embedded relevant tool CTA, no page ships that couldn't earn a citation on its own. Publish in tranches of 100–200 with indexing monitoring — volume follows quality signals, not the reverse.

## 3. Free tools (each = tool page + gated depth)
1. **HS code finder** — describe product → AI suggests codes + rationale; gate: save/export list. (Reuses `hs-codes` module logic.)
2. **Landed-cost / Incoterm calculator** — EXW→FOB→CIF→DDP build-up; gate: save as cost sheet → becomes tenant on signup. (Reuses `pricing-buildup.ts`.)
3. **RoDTEP/drawback calculator** — HS + FOB value → incentive estimate; gate: claim tracker.
4. **LC discrepancy checker** — paste/upload LC text → AI flags issues (the #1 PQL signal, GTM); gate: full report emailed. Rate-limited + metered hard (model cost).
5. **Export-readiness quiz** — first-timer wedge → personalized checklist.
6. **Document checklist generator** — product + destination → required-docs list (M1 data, interactive).
Rule: tools run the **same engine code as the product** (thin wrappers) — no fork to maintain, and "sign up to keep this" is a natural continuation, not a wall.

## 4. GEO (answer-engine) program
- llms.txt curated to money pages + tools; stat pages with citable, dated numbers; author/entity signals (About, founder bios, org schema).
- **State of Indian SMB Exports** annual report (GTM 2027Q4): aggregate anonymized platform data + survey → PR, backlinks, the citation asset.
- Quarterly GEO audit: ask ChatGPT/Perplexity/Gemini the top 50 queries ("what documents do I need to export towels to UAE") — track citation share like rankings.
- Freshness: DGFT-circular pages updated within a week of changes (the corpus ingestion job doubles as the trigger) — recency is a GEO ranking factor and a trust proof.

## 5. Editorial cadence & ops
2/wk guides (WRITING-STYLE voice: specific, numeric, plain), 1/wk WhatsApp digest cross-posted as `/guides/circular-digest/[week]`, case study per quarter from CS pipeline. AI-drafted, human-edited, domain-expert-reviewed for compliance claims (TEAMS §5 hire reviews anything stating a rule). Ownership: content/community hire (2026Q4) runs the calendar; eng owns matrices + tools.

## 6. Measurement
GSC + product analytics joined on landing path → cohort: page/tool → signup → org → activation → paid (the GTM funnel by source). KPI: tool→signup ≥10%, organic→signup ≥3%, M1/M2 indexed ≥80%, citation share trend. Kill rule: any matrix < 0.5% signup contribution after 2 quarters gets pruned, not grown (saturation lesson).

## 7. Build order
1. Infra (sitemap/llms/schema/OG) + pricing + security pages.
2. Tools 1–2 (reuse existing engines) → they work standalone before content volume exists.
3. M5 glossary + M4 country guides (corpus-fed, high AEO value per page).
4. M1 first 200 (top 8 products × top 25 lanes) + internal link graph.
5. LC checker (after AI_PLATFORM router+metering — model cost control).
6. M2 HS pages + remaining matrices in tranches.
