// Central content source for the marketing site.
// Positioning: the AI-first operating system for Indian exporters.

// The seven-stage exporter journey — the spine of the product story.
export const journey = [
  {
    stage: "Discover",
    title: "Win the buyer",
    desc: "Unified leads inbox from email, WhatsApp and trade portals, with AI-drafted follow-ups and denied-party screening.",
  },
  {
    stage: "Quote",
    title: "Price with confidence",
    desc: "Paste a buyer RFQ, get a structured spec and an Incoterm-aware cost build-up — EXW to DDP — with margin guardrails.",
  },
  {
    stage: "Source",
    title: "Compare vendors",
    desc: "Broadcast RFQs to shortlisted vendors, collect quotes in a portal and compare true landed cost side by side.",
  },
  {
    stage: "Produce",
    title: "Track execution",
    desc: "Stage checkpoints from PO to ready-for-inspection, AQL-based QC with photo evidence and delay alerts.",
  },
  {
    stage: "Document",
    title: "Ship & comply",
    desc: "The 20+ shipment documents auto-filled from order data and AI-checked for cross-document consistency.",
  },
  {
    stage: "Track",
    title: "Move the cargo",
    desc: "Milestone tracking with buyer-visible timelines and demurrage and detention countdown alerts.",
  },
  {
    stage: "Get paid",
    title: "Collect & claim",
    desc: "Multi-currency invoicing aligned to GST, LC document sets and RoDTEP and drawback incentives tracked to the rupee.",
  },
] as const;

// The AI moat — the expert work Zimplifyed does so a small firm doesn't need a CHA on staff.
export const aiCapabilities = [
  {
    name: "RFQ spec extraction",
    desc: "Paste a buyer email or PDF and get a structured spec: product, quantity, sizes, packing, target price and delivery terms.",
  },
  {
    name: "Cross-document consistency",
    desc: "The #1 cause of customs holds and LC rejections — Zimplifyed checks every field across your document set before it ships.",
  },
  {
    name: "HS code assistant",
    desc: "AI classification with duty and RoDTEP-rate lookup and rationale, flagging CTH mismatches between invoice and shipping bill.",
  },
  {
    name: "LC & Incoterms advisor",
    desc: "Reviews draft LC terms against the order and flags unworkable clauses before you accept them.",
  },
] as const;

// Modules grouped by the journey — enterprise depth, SMB simplicity.
export const suiteGroups = [
  {
    group: "Win business",
    modules: ["Leads inbox", "Buyer CRM", "Quote builder", "Buyer discovery"],
  },
  {
    group: "Price & source",
    modules: ["Vendor management", "Vendor RFQ & rate compare", "Costing engine", "Sampling"],
  },
  {
    group: "Execute orders",
    modules: ["Order management", "Production tracker", "QC & inspection", "Cartonization"],
  },
  {
    group: "Ship & comply",
    modules: ["Document generator", "HS code assistant", "Compliance vault", "Shipment tracking"],
  },
  {
    group: "Get paid",
    modules: ["Invoicing", "Incentives (RoDTEP)", "FX & receivables", "P&L per order"],
  },
] as const;

// Scripted steps for the hero AI-chat -> action demo mock.
export const heroDemo = {
  prompt:
    "Turn this buyer email into a FOB quote for 5,000 cotton bath towels and check the HS code.",
  steps: [
    "Extracting spec from buyer RFQ",
    "Building FOB Mundra cost sheet",
    "Classifying HS code 6302.60 · RoDTEP 3.9%",
    "Drafting proforma invoice PI-2041",
  ],
  result: {
    title: "Quote QT-2041 ready · proforma drafted",
    detail: "5,000 pcs · FOB $2.14/pc · 22% margin · docs consistency-checked",
    time: "Done in 1m 42s",
  },
} as const;

// "Founder's day, compressed" — the hero motion graphic. A founder's chaotic
// day of tabs and threads collapses into one ask, and calm outcomes appear.
export const heroStory = {
  before: {
    label: "A founder's Tuesday",
    clockStart: "9:00 AM",
    clockEnd: "9:47 PM",
    chaos: [
      "14 browser tabs",
      "Costing spreadsheet v7",
      "WhatsApp × 14 vendors",
      "Buyer email thread (32)",
      "HS code guesswork",
      "CHA follow-up call",
      "LC clause doubts",
      "Shipping bill retyped",
    ],
  },
  ask: "Turn this buyer email into a FOB quote — and check the HS code.",
  after: {
    label: "With Zimplifyed",
    elapsed: "1m 42s",
    outcomes: [
      {
        title: "Quote QT-2041 ready",
        detail: "FOB $2.14/pc · 22% margin · proforma drafted",
      },
      {
        title: "20+ docs verified",
        detail: "Consistency-checked · ICEGATE-ready fields",
      },
      {
        title: "Payment & incentives tracked",
        detail: "LC advised · RoDTEP 3.9% claimed",
      },
    ],
  },
} as const;

// Proof stats — used instead of fictional customer logos.
export const proofStats = [
  { value: "20+", label: "shipment documents auto-generated" },
  { value: "7", label: "stages, from buyer discovery to payment" },
  { value: "ICEGATE", label: "-ready shipping bill fields" },
  { value: "RoDTEP", label: "& drawback incentives tracked" },
] as const;

// Personas replace generic industry cards.
export const personas = [
  {
    slug: "trader",
    name: "Merchant exporter",
    headline: "Protect margin on every deal",
    blurb:
      "Buy from vendors, sell abroad on thin margins. Zimplifyed compares landed cost across vendors and quotes buyers in minutes.",
    points: ["Vendor rate comparison", "Incoterm cost build-up", "Margin guardrails per quote"],
  },
  {
    slug: "manufacturer",
    name: "Manufacturer-exporter",
    headline: "From order to packed container",
    blurb:
      "Own your production. Track cutting to packing, run AQL inspections with photo evidence and cost every order truthfully.",
    points: ["Production stage tracking", "AQL QC with buyer sign-off", "True cost of goods per order"],
  },
  {
    slug: "ops",
    name: "Export ops manager",
    headline: "Never miss a document or deadline",
    blurb:
      "Run docs and logistics. Auto-fill 20+ export documents, catch cross-document mismatches and never miss a LUT or RCMC renewal.",
    points: ["Consistency-checked doc sets", "Compliance deadline engine", "Shipment milestone tracking"],
  },
  {
    slug: "founder",
    name: "Founder / owner",
    headline: "See cash, margin and what's owed",
    blurb:
      "Run a small team. Get P&L per order, incentives owed and the one thing to focus on today — without a full back office.",
    points: ["P&L per order", "Incentives owed (RoDTEP)", "Daily focus, AI-surfaced"],
  },
] as const;

// "Week one" onboarding path.
export const onboarding = [
  { day: "Day 1", title: "Connect your world", desc: "Import IEC, GST/LUT, RCMC and past orders. Zimplifyed reads them and sets up your compliance vault." },
  { day: "Day 2", title: "Bring in buyers & vendors", desc: "Sync leads from email and trade portals; onboard your vendor shortlist into rate comparison." },
  { day: "Day 3", title: "Quote live", desc: "Run your first AI-built, Incoterm-aware quote and share a buyer link that accepts or negotiates." },
  { day: "Week 1", title: "Ship consistency-checked", desc: "Generate a full document set for a live shipment, AI-verified before it reaches customs." },
] as const;

export const faqs = [
  {
    q: "Is this built specifically for Indian export compliance?",
    a: "Yes. Shipping-bill fields map to ICEGATE, documents cover CEPA/FTA certificates of origin, and the deadline engine tracks GST/LUT, RCMC, IEC and buyer-required certs like OEKO-TEX and GOTS.",
  },
  {
    q: "We're a 3-person firm. Is this too much software for us?",
    a: "It's designed for exactly that. The AI does the expert work — HS codes, document drafting, LC review — so you get enterprise depth without hiring a CHA or a back office.",
  },
  {
    q: "How does the AI avoid customs holds and LC rejections?",
    a: "Every document is auto-filled from one source of order data, then cross-checked field-by-field so the invoice, packing list and shipping bill can't contradict each other — the most common cause of holds.",
  },
  {
    q: "Do our overseas buyers need a login?",
    a: "No. Buyers get shareable links for quotes, approvals, document access and shipment tracking — no account friction on their side.",
  },
  {
    q: "Can it handle both trading and manufacturing?",
    a: "Yes. The same journey adapts: traders get vendor RFQ and landed-cost comparison; manufacturers get production stage tracking and cost-of-goods — both feed the same documents and books.",
  },
] as const;

export const navLinks = [
  { label: "Platform", href: "/#platform" },
  { label: "Journey", href: "/#journey" },
  { label: "Solutions", href: "/#solutions" },
  { label: "Security", href: "/#security" },
  { label: "Pricing", href: "/#pricing" },
] as const;
