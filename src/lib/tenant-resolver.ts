/**
 * Edge-safe tenant slug resolution from request host. No DB access here —
 * middleware runs on the Edge runtime where Prisma's Node driver isn't
 * available. This only extracts a *slug*; `getTenantContext` (server-only)
 * resolves the slug to a real Tenant row.
 */

export const DEV_TENANT_SLUG = 'demo';

export function resolveTenantSlug(host: string | null | undefined): string {
  if (!host) return DEV_TENANT_SLUG;

  const noPort = host.split(':')[0].toLowerCase();

  if (noPort === 'localhost' || noPort.endsWith('.localhost') || noPort === '127.0.0.1') {
    return DEV_TENANT_SLUG;
  }

  // {slug}.simplifi.ai
  const subMatch = noPort.match(/^([a-z0-9-]+)\.simplifi\.ai$/);
  if (subMatch && subMatch[1] !== 'www') return subMatch[1];

  return DEV_TENANT_SLUG;
}
