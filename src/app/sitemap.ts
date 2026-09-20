import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Indexable marketing pages. `updated` is the date the page's content last materially changed —
// bump it when you edit the page, never set it to build time (a lastmod that always moves gets ignored).
// Split into generateSitemaps() per matrix once programmatic pages ship (docs/SEO_ROADMAP.md §2.4).
const PAGES: { path: string; updated: string; priority: number }[] = [
  { path: "/", updated: "2026-09-19", priority: 1 },
  { path: "/pricing", updated: "2026-09-19", priority: 0.9 },
  { path: "/tools", updated: "2026-09-19", priority: 0.9 },
  { path: "/tools/hs-finder", updated: "2026-09-19", priority: 0.8 },
  { path: "/tools/landed-cost", updated: "2026-09-19", priority: 0.8 },
  { path: "/tools/lc-checker", updated: "2026-09-19", priority: 0.8 },
  { path: "/security", updated: "2026-09-19", priority: 0.7 },
  { path: "/demo", updated: "2026-09-19", priority: 0.5 },
  { path: "/signup", updated: "2026-09-19", priority: 0.5 },
  { path: "/privacy", updated: "2026-09-19", priority: 0.2 },
  { path: "/terms", updated: "2026-09-19", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({
    url: `${SITE_URL}${p.path === "/" ? "" : p.path}`,
    lastModified: p.updated,
    priority: p.priority,
  }));
}
