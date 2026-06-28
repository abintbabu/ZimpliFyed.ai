// Central content source for the marketing site.

export const modules = [
  {
    name: "CRM",
    desc: "AI drafts the follow-ups, scores the leads and keeps every customer relationship moving.",
  },
  {
    name: "ERP",
    desc: "The single source of truth that ties every part of your business together — kept current automatically.",
  },
  {
    name: "Orders",
    desc: "Raise, approve and fulfil sales and purchase orders end to end — just ask.",
  },
  {
    name: "Inventory",
    desc: "Stock, warehouses, batches and reorder points that predict and replenish themselves.",
  },
  {
    name: "HRMS",
    desc: "Onboard, track attendance and manage leave — the AI handles the paperwork.",
  },
  {
    name: "Payroll",
    desc: "Run salaries, stay compliant and issue payslips in a single sentence.",
  },
  {
    name: "Accounting",
    desc: "Invoicing, ledgers, AR/AP and tax — books that reconcile and close themselves.",
  },
  {
    name: "Procurement",
    desc: "Source, compare and onboard vendors with RFQs and AI scoring built in.",
  },
] as const;

// Scripted steps for the hero AI-chat → action demo mock.
export const heroDemo = {
  prompt: "Onboard Veda Mills as a supplier and raise a PO for 500 units of cotton yarn.",
  steps: [
    "Creating supplier record · Veda Mills",
    "Running compliance & credit checks",
    "Drafting purchase order PO-2041",
    "Updating inventory & accounting",
  ],
  result: {
    title: "Supplier onboarded · PO-2041 raised",
    detail: "500 units · ₹4.2L · synced to ERP, Inventory & Accounting",
    time: "Done in 1m 48s",
  },
} as const;

export const industries = [
  {
    slug: "export",
    name: "Export",
    headline: "Built for exporters",
    blurb:
      "From quotation to shipment to receivable — manage Incoterms, certificates of origin and export documentation alongside your books.",
    points: ["Export documentation & HS codes", "Letters of Credit & FX exposure", "Container & shipment tracking"],
  },
  {
    slug: "import",
    name: "Import",
    headline: "Built for importers",
    blurb:
      "Land every shipment with duties, customs and supplier costs reconciled automatically against your inventory and accounts.",
    points: ["Duty & landed-cost costing", "Customs & compliance docs", "Supplier & lead-time tracking"],
  },
  {
    slug: "b2b-trade",
    name: "B2B Trade",
    headline: "Built for traders",
    blurb:
      "Run high-volume buy/sell operations with multi-entity ledgers, credit control and a vendor network in one suite.",
    points: ["Multi-entity ledgers", "Credit limits & receivables", "Vendor & buyer network"],
  },
  {
    slug: "manufacturing",
    name: "Manufacturing",
    headline: "Built for manufacturers",
    blurb:
      "Plan production from BOM to finished goods with work orders, MRP and real-time inventory feeding straight into costing.",
    points: ["Bill of Materials & work orders", "Production planning & MRP", "Real-time cost of goods"],
  },
] as const;

export const navLinks = [
  { label: "Platform", href: "/#platform" },
  { label: "Solutions", href: "/#solutions" },
  { label: "Why Simplifi", href: "/#why" },
  { label: "Security", href: "/#security" },
  { label: "Pricing", href: "/#pricing" },
] as const;
