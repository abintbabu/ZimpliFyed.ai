import { RESERVED_SLUGS } from './slug';

/**
 * Edge-safe tenant host classification (EXPORT_OS_MASTER_PLAN §4.2 Layer 1). No DB access here —
 * middleware runs on the Edge runtime where Prisma's Node driver isn't available. `classifyHost` is
 * pure and total: every input maps to exactly one HostResolution, and it never silently falls back
 * to a real tenant. `getTenantContext` (server-only, src/lib/tenant.ts) resolves the classification
 * to an actual Tenant row.
 *
 * The `DEV_TENANT_SLUG = 'demo'` unconditional fallback this file used to have was the single most
 * dangerous line in the codebase (§4.1): a misconfigured DNS record, a preview URL, a health check,
 * or a spoofed Host header would silently read demo-tenant data. `dev` classification now requires
 * `ALLOW_DEV_TENANT_FALLBACK=1` to be set explicitly, and src/instrumentation.ts throws at startup
 * if that flag is set in production.
 */

export const DEV_TENANT_SLUG = process.env.DEV_TENANT_SLUG || 'demo';

const PLATFORM_SURFACE_BY_LABEL: Record<string, 'marketing' | 'app' | 'admin' | 'api'> = {
  app: 'app',
  admin: 'admin',
  api: 'api',
};

export type HostResolution =
  | { kind: 'platform'; surface: 'marketing' | 'app' | 'admin' | 'api' }
  | { kind: 'subdomain'; slug: string }
  | { kind: 'custom'; hostname: string } // candidate, not a grant — TenantDomain lookup is Wave 8
  | { kind: 'dev'; slug: string } // only when ALLOW_DEV_TENANT_FALLBACK=1
  | { kind: 'unknown'; hostname: string };

const SUBDOMAIN_RE = /^([a-z0-9-]+)\.zimplifyed\.ai$/;

/** Strips the port and normalises case/punycode via the WHATWG URL parser (Edge-safe, no Node
 * `punycode`/`net` modules needed) — the browser and every proxy normalise hosts the same way. */
function normaliseHost(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname || null;
  } catch {
    return null;
  }
}

export function classifyHost(host: string | null | undefined): HostResolution {
  const normalised = host ? normaliseHost(host) : null;

  if (!normalised) {
    return devFallbackOr({ kind: 'unknown', hostname: host ?? '' });
  }

  if (normalised === 'localhost' || normalised.endsWith('.localhost') || normalised === '127.0.0.1') {
    return devFallbackOr({ kind: 'unknown', hostname: normalised });
  }

  if (normalised === 'zimplifyed.ai' || normalised === 'www.zimplifyed.ai') {
    return { kind: 'platform', surface: 'marketing' };
  }

  const subMatch = normalised.match(SUBDOMAIN_RE);
  if (subMatch) {
    const label = subMatch[1];
    if (label in PLATFORM_SURFACE_BY_LABEL) {
      return { kind: 'platform', surface: PLATFORM_SURFACE_BY_LABEL[label] };
    }
    if ((RESERVED_SLUGS as readonly string[]).includes(label)) {
      return { kind: 'platform', surface: 'marketing' };
    }
    return { kind: 'subdomain', slug: label };
  }

  // Not dev-fallback-eligible: `custom` is a distinct, meaningful state (a Wave 8 candidate domain,
  // once TenantDomain lookups are wired in) from `unknown`, and adversarial hosts like `evil.com` or
  // `demo.zimplifyed.ai.evil.com` must resolve the same way regardless of ALLOW_DEV_TENANT_FALLBACK.
  return { kind: 'custom', hostname: normalised };
}

/** `dev` only fires when explicitly opted in — see the file header. Otherwise the caller's own
 * classification (unknown/custom) stands, so an unmatched host never silently resolves to a tenant. */
function devFallbackOr(fallback: HostResolution): HostResolution {
  if (process.env.ALLOW_DEV_TENANT_FALLBACK === '1') {
    return { kind: 'dev', slug: DEV_TENANT_SLUG };
  }
  return fallback;
}
