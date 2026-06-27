// Central content source for the marketing site.

export const modules = [
  {
    name: "CRM",
    desc: "Leads, pipeline, contacts and quotes — every customer relationship in one place.",
  },
  {
    name: "ERP",
    desc: "The single source of truth that ties every part of your business together.",
  },
  {
    name: "Orders",
    desc: "Sales and purchase orders, approvals and fulfilment, end to end.",
  },
  {
    name: "Inventory",
    desc: "Stock, warehouses, batches and reorder points across every location.",
  },
  {
    name: "HRMS",
    desc: "Employees, attendance, leave and onboarding without the spreadsheets.",
  },
  {
    name: "Payroll",
    desc: "Run salaries, stay compliant and issue payslips in a few clicks.",
  },
  {
    name: "Accounting",
    desc: "Invoicing, ledgers, AR/AP and tax — books that close themselves.",
  },
  {
    name: "Procurement",
    desc: "Source, compare and manage vendors with RFQs and scoring built in.",
  },
] as const;

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
