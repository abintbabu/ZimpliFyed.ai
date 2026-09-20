# SEO Roadmap — Go-Live, 100 Days, 1000 Days

Owner: CMO seat. Executes `GTM_PLAN.md` §3.1 and `specs/SEO_CONTENT_PLAN.md`, and extends both to the vision in `docs/ROADMAP_2026_2029.md`:

> **One platform for all export and import — safe and secure.**

Day 1 = **Mon 2026-09-21**. Day 30 = 2026-10-20 · Day 60 = 2026-11-19 · Day 100 = 2026-12-29 · Day 365 = 2027-09-20 · Day 1000 = **2029-06-16**.

This document does not change the targets in `CMO_MARKETING_PLAN.md` (30k organic sessions/mo by mid-2027, 250k/mo by 2029, 2,000+ pages by end-2027). It sequences how SEO gets there.

---

## 1. Where we are today (audit, 2026-09-19)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| A1 | No `sitemap.xml`, `robots.txt`, or `llms.txt` | none in `src/app` or `public/` | Blocker |
| A2 | No `metadataBase`, so canonical and OG URLs can't resolve to absolute URLs | `src/app/layout.tsx` | Blocker |
| A3 | The site-wide title and description sell the wrong category: *"operating system for founders — CRM, ERP, HRMS, Payroll"* | `src/app/layout.tsx:15-22` | Blocker (positioning) |
| A4 | Homepage has no page-level metadata, so it inherits A3 | `src/app/(marketing)/page.tsx` | High |
| A5 | No structured data (Organization, SoftwareApplication, FAQPage) anywhere | — | High |
| A6 | Security copy says *"Encrypted … end to end"*. End-to-end encryption is a specific technical claim we most likely don't meet. Trust copy that fails scrutiny hurts the "safe and secure" promise more than silence does | `src/components/home/sections.tsx:237` | High (claims) |
| A7 | Only 3 tools are live (HS finder, landed cost, LC checker). No `/guides`, `/export`, `/import`, `/hs`, `/glossary`, `/compare`, or `/security` routes | `src/app/(marketing)/` | Expected at this stage |
| A8 | No OG images and no per-page canonicals | — | Medium |
| A9 | The app host (`app.zimplifyed.ai`) needs to be `noindex` and blocked from crawl. It must not compete with marketing pages | `hero-motion.tsx:95` shows the host | Medium |
| A10 | Everything is export-only. The import half of the vision has zero search surface | — | Strategic gap |

**Implication:** we are not ready to be crawled. Fix A1–A6 before any public announcement. A crawler's first impression of a new domain sticks for weeks.

---

## 2. Strategy in one page

### 2.1 What we want to own
Four positions, in this order:

1. **The answer to every export and import compliance question an Indian SMB asks**, whether they ask Google, ChatGPT, Perplexity, or Gemini. Examples: "documents to export towels to UAE", "RoDTEP rate HS 6302", "customs duty on importing CNC machine from China".
2. **The free tools exporters and importers bookmark** (HS finder, landed cost, LC checker, duty calculator, doc checklist).
3. **The category term "Export OS"**, plus the commercial terms: *export documentation software, export management software, import management software, CRM for exporters*.
4. **The trust position.** Searches for "is Zimplifyed safe", "Zimplifyed review", or "Zimplifyed vs Zoho" land on pages we control that are backed by proof.

### 2.2 Topical map (the five clusters)

| Cluster | Intent | Page types | Example head terms |
|---|---|---|---|
| **C1 Export compliance** | Informational → tool | M1 docs-by-lane, M2 HS pages, scheme pages (RoDTEP, drawback, LUT, e-BRC, Advance Authorisation, EPCG) | "export documents list", "RoDTEP rates", "LUT under GST" |
| **C2 Import compliance** *(new)* | Informational → tool | Duty-by-HS-and-origin pages, bill of entry guide, IEC guide, FTA/CEPA preference pages, restricted/prohibited lists | "customs duty calculator India", "bill of entry process", "import from China to India duty" |
| **C3 Trade finance and payments** | Informational | LC guides, payment terms, FEMA realisation, UCP 600 plain-English explainers | "LC discrepancies", "export payment realisation time limit" |
| **C4 Logistics and Incoterms** | Informational → tool | Incoterm pages, port pages, container guides, landed-cost tool | "FOB vs CIF", "Nhava Sheva port code" |
| **C5 Software and category** | Commercial | Home, pricing, feature pages, `/compare/*`, `/for/{persona}`, `/security` | "export management software India", "Zoho alternative for exporters" |

C1–C4 bring traffic and authority. C5 converts it. Every C1–C4 page links to the one tool that finishes the reader's job and to one C5 page. This link graph is the actual product of the SEO programme.

### 2.3 Rules that decide whether this works (non-negotiable)

- **Compliance content is quasi-YMYL.** A wrong duty rate costs someone money. Every page that states a rule needs a named reviewer with credentials, an "as of" date, and links to the primary sources (DGFT, CBIC, ICEGATE, RBI). The CCO seat signs off on compliance pages before they ship. This is our E-E-A-T and our GEO citability at the same time.
- **Programmatic ≠ scaled content abuse.** Google's spam policy targets templated pages without unique value. Every programmatic page must have ≥40% unique data, a direct 2–3 sentence answer block, and a working tool embed. Publish in tranches of 100–200. The next tranche ships only if the last one reached ≥70% indexed within 28 days. A tranche that doesn't index gets fixed or pruned, never followed by more of the same.
- **"Safe and secure" is proven, never adjectived.** No trust badge, certification, or encryption claim we can't show. The `/security` page lists what we actually do (tenant isolation, encryption at rest and in transit, DPDP consent, India data residency plan, incident process). SOC 2 is mentioned only once the audit is scheduled, and then as "in progress". The claims-discipline rule and pending sign-offs in `docs/DECISIONS.md` (2026-08-31) apply to every SEO page.
- **No fake review schema. Ever.** `AggregateRating` appears only after real, verifiable reviews exist (the anabyn lesson).
- **Bing matters as much as Google for GEO.** ChatGPT search leans on Bing's index. Set up Bing Webmaster Tools and IndexNow on day one, not as an afterthought.
- **One channel never exceeds 50% of signups** (GTM §10). SEO is the compounding engine, not the only engine.

### 2.4 Site architecture (extends `specs/SEO_CONTENT_PLAN.md` §1)
```
zimplifyed.ai/                         Export + Import OS story
  /pricing  /security  /about  /contact
  /for/{exporters|importers|merchant-traders|first-time-exporters|ca-firms}
  /tools/{hs-finder|landed-cost|lc-checker|duty-calculator|rodtep|doc-checklist|readiness-quiz}
  /export/{product}/{country}          M1 docs-by-lane (money pages)
  /import/{product}/{origin}           M7 duty + docs by import lane (new)
  /hs/{code}                           M2, both directions: export incentives + import duty
  /schemes/{rodtep|drawback|lut|epcg|advance-authorisation|...}
  /countries/{country}                 M4, export AND import sections
  /glossary/{term}                     M5
  /guides/{slug}                       pillars + circular digests
  /compare/{zoho|tally|excel|indiamart}
  /customers/{slug}
  /hi/...                              Hindi mirror of top pages (hreflang)
app.zimplifyed.ai                      noindex, robots disallow — never ranks
```
Use subfolders, never subdomains, for content and languages, so authority stays on one host. Country expansion (Bangladesh, Vietnam, UAE) later uses `/{cc}/` subfolders with hreflang, not ccTLDs.

---

## 3. Go-live plan

### 3.1 Pre-launch gates (Days 1–10). **All must pass before any public announcement.**

_Status 2026-09-19: code items marked [x] are implemented on branch `docs/cxo-charter-raas-roadmap`. Robots and noindex are host-aware via `classifyHost`, so only `zimplifyed.ai`/`www` is indexable, and tenant subdomains, `app.`, custom domains and previews are not. Per-page canonicals use `alternates.canonical`. The sitemap is a single file until matrices ship. JSON-LD is partly done: Organization, WebSite, SoftwareApplication and FAQPage on home, WebApplication and BreadcrumbList on tools and security._

**Technical (CTO, 1–2 engineer-days total):**
- [x] `src/app/robots.ts`: allow the marketing host. Disallow `/dashboard`, `/admin`, `/api`, `/join`, `/welcome`, `/no-access`, `/doc-set`, `/quote`, `/track`. Serve `Disallow: /` on `app.` plus an `X-Robots-Tag: noindex` header.
- [x] `src/app/sitemap.ts` with `generateSitemaps` segmented by type (core, tools, guides, and one per matrix). Use real `lastmod` values from data freshness, not build time.
- [x] `metadataBase` set in the root layout. Per-page `title`, `description`, `alternates.canonical`, and `openGraph` via `generateMetadata`. The title template becomes `%s · Zimplifyed`.
- [x] Rewrite root and homepage metadata to the Export + Import OS positioning (fixes A3/A4). Proposed title: *"Zimplifyed — Export & Import OS: documents, compliance, costing and CRM in one secure platform"* (CMO to approve).
- [x] JSON-LD: `Organization` and `WebSite` (sitewide), `SoftwareApplication` (home, pricing; `offers` from real plans only), `FAQPage` (where a real FAQ is visible on the page), `WebApplication` (each tool), `BreadcrumbList` (all deep pages).
- [x] `opengraph-image.tsx` template per route group.
- [x] `public/llms.txt` curated to home, pricing, security, tools, and the top guides. `llms-full.txt` comes later.
- [ ] Core Web Vitals on mobile (4G, mid-range Android is the ICP's device): LCP < 2.5s, INP < 200ms, CLS < 0.1 on home, pricing, and each tool. Audit the hero motion components for LCP and INP cost.
- [ ] 404/410 handling, one canonical host (redirect `www` ↔ apex and all `zimplified.*` typo domains 301 to the canonical), HTTPS/HSTS.
- [ ] Analytics: GSC (domain property), Bing Webmaster Tools, IndexNow key, product analytics joining landing path → signup → org → activation (per `specs/SEO_CONTENT_PLAN.md` §6).

**Content and trust (CMO + CCO + CISO):**
- [x] `/security` page, factual only. Fix the "end to end" line (A6) to "encrypted in transit (TLS) and at rest", assuming CISO confirms at-rest encryption.
- [ ] `/about` with founder bio, company details, registered address, and contact. These are entity signals for Google's Knowledge Graph and for LLMs.
- [ ] Each of the 3 live tools gets 600–1,000 words of genuinely useful explainer below the tool, a FAQ, and a "reviewed by" line.
- [ ] 10 cornerstone guides, 5 export and 5 import (list in §4.1).
- [ ] Legal pages linked in the footer. Privacy policy states DPDP posture.

**Off-site entity setup:**
- [ ] Google Business Profile (if an address is publishable), LinkedIn company page, YouTube channel, and X handle, with consistent name, logo, and description (NAP consistency).
- [ ] Wikidata entry only once notability exists. Don't force it.

### 3.2 Launch week (Day 11 ± a few days, founder picks the date)
1. Submit sitemaps in GSC and Bing. Ping IndexNow. Request indexing for the top 20 URLs manually.
2. Publish the launch post on `/guides` and LinkedIn (founder), and share it in the WhatsApp community.
3. First 10 genuine links: FIEO/EPC member directories, startup directories (Product Hunt, G2/Capterra **profile only, no bought reviews**), SaaS directories that serve India, and the anabyn site linking to its own tool provider (one contextual link, not sitewide).
4. Watch GSC coverage daily for 14 days. Anything "Crawled — not indexed" in the first week is a template quality signal. Investigate before publishing more.

---

## 4. The 100-day plan (2026-09-21 → 2026-12-29)

### Phase 1 — Foundation (Days 1–10, to 2026-09-30)
Everything in §3.1. **Exit gate:** zero technical blockers, all live pages indexable, GSC and Bing verified.

### Phase 2 — Seed authority (Days 11–30, to 2026-10-20)
- **10 cornerstone guides** (2,000–3,500 words each, CCO-reviewed):
  Export: *How to start exporting from India (2026)* · *Complete export documents list* · *RoDTEP explained with rate lookup* · *LUT under GST: filing and renewal* · *Letter of credit for exporters: the 12 discrepancies that get LCs rejected*.
  Import: *How to import into India: IEC to bill of entry* · *Customs duty in India: BCD, SWS, IGST explained* · *Importing from China to India* · *FTA/CEPA duty benefits (UAE, Australia, ASEAN)* · *Landed cost: the complete formula*.
- **Glossary v1:** 60 terms, each with a 40–60 word definition block (answer-first), an example, and links to the relevant guide and tool.
- **Country guides v1:** top 10 export destinations (US, UAE, UK, Germany, Netherlands, Saudi, Bangladesh, Australia, Singapore, Belgium), each with export and import sections.
- **Tool #4: Import duty calculator** (HS + origin → BCD/SWS/IGST/FTA preference). This is the anchor for the import half of the vision. It reuses the landed-cost engine.
- **Exit KPIs:** ≥80 indexed URLs. First impressions in GSC for C1/C2 long-tail terms.

### Phase 3 — First programmatic tranche (Days 31–60, to 2026-11-19)
- **M1 tranche 1:** 200 pages covering 8 top products × 25 lanes (textiles/home linen first, the ICP-1 bullseye). Each page: answer block, lane-specific doc list, HS codes, incentives, payment norms, port info, the doc-checklist tool embed, and 3+ internal links from the link-graph module.
- **M2 tranche 1:** 100 HS pages (the codes behind those 8 products), both directions: export incentives and import duty.
- **Scheme pages:** RoDTEP, drawback, LUT, EPCG, Advance Authorisation, e-BRC, MEIS legacy (a redirect target).
- **Tool #5: Document checklist generator** (M1 data made interactive).
- **Compare pages:** vs Excel, vs Zoho, vs Tally. Honest and specific, including where they win.
- **Freshness loop:** the DGFT/CBIC circular ingestion job flags affected pages. Target: pages updated within 7 days of a notification, with a visible "Updated for Notification No. X" line.
- **Exit KPIs:** tranche 1 ≥70% indexed within 28 days (the gate for tranche 2). Tool → signup ≥10%.

### Phase 4 — Prove and scale (Days 61–100, to 2026-12-29)
- **If the gate passed:** M1 tranche 2 (+200 pages) and M7 import-lane tranche 1 (100 pages: top 10 import products × top 10 origins).
- **Tool #6: RoDTEP/drawback calculator.** The **LC checker** gets its full explainer and FAQ, since it's the PQL magnet (`GTM_PLAN.md` §3.1).
- **Persona landing pages:** `/for/exporters`, `/for/importers`, `/for/merchant-traders`, `/for/first-time-exporters`, `/for/ca-firms`.
- **Hindi v1:** `/hi/` versions of the home page, 3 tools, and the top 5 guides, with hreflang pairs. Human-reviewed, not raw machine translation.
- **Digital PR #1:** "India Export Documentation Error Report", a survey of 100+ exporters via the WhatsApp community and EPC partners. This is the first link and citation asset.
- **GEO baseline audit:** ask ChatGPT, Perplexity, Gemini, and Google AI Mode our top 50 queries. Record who gets cited. This becomes the citation-share KPI.
- **Year-end compliance calendar content** (published by 2026-12-15): *Export compliance checklist for Q4 FY26-27* and *LUT renewal for FY 2027-28* (renewal is due before 1 April, so ranking needs to start by January).
- **Day-100 review:** prune or fix any page with zero impressions after 60 days. Re-plan the tranche cadence for 2027.

### Day-100 scorecard (targets)

| Metric | Day 100 target | Why this number |
|---|---|---|
| Quality pages live / indexed | ~700 / ≥75% | Tranches gated on indexing, not on a calendar |
| Organic sessions/mo | 5k–10k | New domain. Long-tail first, head terms later |
| Keywords in top 10 (GSC) | 300+ | Mostly long-tail M1/M2/glossary |
| Tool → signup | ≥10% | `GTM_PLAN.md` §3.1 KPI |
| Organic → signup | ≥3% | Same |
| Referring domains | 40+ (quality, not count) | Directories + EPCs + PR asset |
| AI citation share (top 50 queries) | Baseline measured, ≥5 citations | GEO starts from zero |
| Core Web Vitals | 100% "Good" URLs on mobile | Table stakes |

---

## 5. The 1000-day roadmap (2026-09-21 → 2029-06-16)

### Stage 1 — Authority (Days 1–365, to 2027-09-20)
**Goal:** be the most useful Indian trade-compliance site on the long tail, and hit the CMO target of **30k organic sessions/mo by mid-2027**.
- **Pages:** 2,000 by end-2027 (per GTM), split roughly as 1,000 M1 export lanes · 500 M2 HS · 250 M7 import lanes · 150 glossary · 40 country guides · 40 how-to-export-{product} · 20 compare.
- **Tools:** all 7 live, plus the export-readiness quiz (the Day-0 wedge: roughly 90k new IECs a year).
- **Seasonal calendar** (plan every year):
  - **Feb 1 Union Budget:** customs duty changes. Publish an "import duty changes in Budget 2027" hub within 48 hours and update affected `/hs/` pages within 7 days. This is the biggest import-traffic spike of the year.
  - **Mar:** LUT renewal, FY-end realisation, and e-BRC content.
  - **Apr:** Foreign Trade Policy updates and new-FY scheme rates.
  - **Trade-fair season** (IHGF, Heimtextil): fair-specific guides.
- **Links:** "State of Indian SMB Exports" annual report #1 (Q4 2027, per GTM). EPC and FIEO co-published webinars (each one a link). Guest columns in trade press (DGFT-watchers, logistics publications). Founder quoted as the source on circular changes.
- **Case studies:** 1 per quarter from design partners, with named companies and real numbers.
- **Vernacular:** Hindi covers the top 100 pages. Tamil, Telugu, and Gujarati landing pages for cluster campaigns (Tirupur, Karur, Surat, Ludhiana).
- **YouTube SEO:** one video per cornerstone guide, embedded on the guide (video carousels plus a second search engine for "how to export").
- **Exit:** ≥30k organic sessions/mo · organic ≥45% of signups · top 3 for "export documentation software India" · cited in ≥20% of the top-50 AI answers.

### Stage 2 — Breadth: the import side and the category (Days 366–730, to 2028-09-20)
**Goal:** the platform ranks as *the* place for **export and import**, and "Export OS" becomes a searched term.
- **Import parity:** M7 grows to 1,000 import lanes. Add restricted/prohibited-item checkers, BIS/FSSAI/WPC requirements by product, and bill-of-entry error guides. This SEO surface supports R9 (Import landed-cost + clearance) in `docs/ROADMAP_2026_2029.md`.
- **Buyer-side content (ICP-4):** "How to source {product} from India": supplier-country guides written for overseas importers in the US, EU, UAE, and UK. This is the first non-Indian audience and the start of the two-sided network.
- **Data assets:** a public, frequently updated "India trade-data explorer" (aggregate DGCI&S/ITC-HS stats by HS and country). Data pages get linked by journalists and cited by LLMs.
- **Programmatic depth over breadth:** grow only the matrices whose signup contribution is ≥0.5% (kill rule, `specs/SEO_CONTENT_PLAN.md` §6). Expect to prune about 20% of pages this year.
- **Brand demand:** grow branded search through YouTube, the community, and partners. Branded share of organic clicks ≥25% is the signal that Google treats us as an entity, not a content farm.
- **Trust surface:** a public status page, a security whitepaper, the SOC 2 Type I report page once achieved (per CISO trigger), and a DPDP compliance statement. These rank for "{brand} security/reviews" and get cited in enterprise vendor reviews.
- **Exit:** ~100k organic sessions/mo · page 1 for "export management software" and "import management software India" · "Zimplifyed" branded searches ≥10k/mo.

### Stage 3 — Global category leadership (Days 731–1000, to 2029-06-16)
**Goal:** the default answer, in search and in AI assistants, for SMB cross-border trade from India and the first expansion corridors. On track for **250k organic sessions/mo in 2029** (CMO plan).
- **Country packs:** `/bd/` (Bangladesh) and `/vn/` (Vietnam), each launched with 200 localized programmatic pages, 2 local partners, and a community (GTM §4, Stage 3). Use hreflang. Local-language content is reviewed by local compliance advisers (CCO).
- **Corridor hubs:** India↔UAE (CEPA), India↔UK (FTA), India↔EU (FTA/CBAM). Each is a pillar with both-direction tools. **CBAM content** for EU-bound exporters will be a large, growing search pool in 2028–29.
- **API/docs SEO:** public developer docs for integrations bring in forwarders, CHAs, and banks searching for trade APIs.
- **AI-native distribution:** structured, versioned datasets (HS × country × docs × duty) exposed via llms-full.txt and a public read API, so assistants retrieve us directly. The GEO target is to be the cited source for Indian trade compliance in the majority of AI answers.
- **Exit (Day 1000):** 200k–250k organic sessions/mo · AI citation share ≥40% on top-100 queries · organic plus AI referrals ≥50% of signups, with no single channel over 50% (GTM rule) · 5,000+ quality pages, pruned and fresh.

### 1000-day milestone summary

| Checkpoint | Date | Pages (indexed) | Organic sessions/mo | Key unlock |
|---|---|---|---|---|
| Go-live | 2026-09-30 | ~30 | — | Technical blockers cleared |
| Day 100 | 2026-12-29 | ~700 | 5–10k | Tranche gate proven, import tool live |
| Day 365 | 2027-09-20 | ~2,000 | 30k | Authority on long tail, first report |
| Day 730 | 2028-09-20 | ~3,500 | ~100k | Import parity, buyer-side, brand demand |
| Day 1000 | 2029-06-16 | ~5,000 | 200–250k | Country packs, AI-citation leadership |

---

## 6. Operating model

- **Team:** CMO seat owns the calendar. The content/community hire (2026Q4, per GTM §7) edits. The CCO seat plus the trade-domain expert review every compliance claim. The CTO seat owns templates, the link graph, CWV, and the freshness pipeline. AI drafts, humans edit, experts sign off. No page ships unreviewed.
- **Cadence:**
  - Weekly: GSC and Bing indexing review, plus a tranche decision.
  - Monthly: rankings, conversion by page type, and the prune list.
  - Quarterly: GEO citation audit, technical audit, and a matrix kill/grow decision.
- **Dashboard (one view):** indexed % per matrix · impressions/clicks per cluster · tool → signup · organic → signup → activation → paid · referring domains · AI citation share · CWV · freshness lag (circular date → page update).
- **Budget:** within GTM §7's $2–4k/mo for 2026H2–2027H1. Spend goes to the domain-expert reviewer, one PR asset per half-year, and tooling (GSC/Bing are free, plus one rank tracker). No link buying.

---

## 7. Risks and counters

| Risk | Counter |
|---|---|
| Google classifies programmatic pages as scaled content abuse | Tranche gating on indexing rate, ≥40% unique data, pruning, human review |
| A wrong compliance number goes viral | CCO sign-off, "as of" dates, source links, 7-day freshness SLA, visible corrections log |
| AI Overviews absorb clicks on informational queries | Tools and gated depth (the answer is free, doing the job needs the product). Chase citation share, not just rank |
| Overclaiming "safe and secure" backfires | Proof-only trust copy, fix A6, SOC 2 claimed only when real |
| Import side dilutes the export ICP focus | Import content launches as tools plus top lanes only until R9 is live. Scale it in Stage 2 |
| Algorithm volatility | No channel >50%. Community, partners, and YouTube are built in parallel (GTM §10) |

---

## 8. Decisions needed from the founder

1. **Positioning line for title/meta.** Approve replacing "operating system for founders — CRM, ERP, HRMS, Payroll" with Export + Import OS positioning (A3).
2. **Security copy fix.** Approve changing "encrypted … end to end" to a claim CISO can verify (A6).
3. **Import scope in the first 100 days.** Approve the duty calculator plus 10 import cornerstone guides plus the M7 tranche, ahead of R9 shipping, labelled as information and tools, not as a claim that the clearance service is live.
4. **Launch date** for the public announcement, once the §3.1 gates pass.
5. **Named compliance reviewer** whose credentials appear on pages (E-E-A-T depends on a real person).
