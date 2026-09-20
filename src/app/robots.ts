import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_URL, isIndexableHost } from "@/lib/site";

// Signed-in, token-link and API surfaces. Crawlers never need them, and token pages
// (quotes, tracking, doc-sets, invites) are private to whoever holds the link.
const PRIVATE_PATHS = [
  "/dashboard",
  "/admin",
  "/api/",
  "/join/",
  "/welcome",
  "/no-access",
  "/doc-set/",
  "/quote/",
  "/track/",
  "/login/check-email",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host");

  if (!isIndexableHost(host)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
