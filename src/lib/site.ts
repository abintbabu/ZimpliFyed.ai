// Canonical marketing-site identity. SEO metadata, sitemap, robots and JSON-LD all read from here
// so the host and positioning can't drift between them (docs/SEO_ROADMAP.md §3.1).

import { classifyHost } from "./tenant-resolver";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://zimplifyed.ai").replace(/\/$/, "");

export const SITE_NAME = "Zimplifyed";

export const SITE_TITLE = "Zimplifyed — the Export & Import OS for Indian businesses";

export const SITE_DESCRIPTION =
  "One secure platform for exporters and importers: quotes, vendor sourcing, landed cost, shipment documents and compliance — with AI doing the paperwork.";

export const CONTACT_EMAIL = "hello@zimplifyed.ai";

// Only the marketing host is indexable. app./admin./api., tenant subdomains, custom domains, previews
// and localhost all serve noindex so they never compete with (or leak into) marketing search results.
export function isIndexableHost(host: string | null): boolean {
  const resolved = classifyHost(host);
  return resolved.kind === "platform" && resolved.surface === "marketing";
}

/** Serialise JSON-LD for a <script> tag; escapes `<` so a string field can't close the tag (Next JSON-LD guide). */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  email: CONTACT_EMAIL,
  description: SITE_DESCRIPTION,
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { "@id": `${SITE_URL}/#organization` },
  inLanguage: "en-IN",
};

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function toolLd(opts: { name: string; path: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: opts.name,
    url: `${SITE_URL}${opts.path}`,
    description: opts.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}
