import 'server-only';
import { prisma } from '@/lib/prisma';

/**
 * Per-tenant feature flags for gradual rollouts (SELF_SERVE_PLAN §6). Flags are
 * keyed by string so a new one ships without a migration; register its metadata
 * here so the admin console can render a labelled toggle and a code default.
 *
 * `default` is what the product does when no FeatureFlag row exists for the
 * tenant — a row (set from the admin console) pins the flag on/off, overriding
 * the default for that tenant only.
 */
export type FeatureFlagKey =
  | 'copilot_v2'
  | 'doc_engine_v1'
  | 'inbox_sync'
  | 'whatsapp_notifications';

export const FEATURE_FLAGS: Record<FeatureFlagKey, { label: string; description: string; default: boolean }> = {
  copilot_v2: {
    label: 'Copilot v2',
    description: 'Next-gen retrieval-augmented Copilot for this tenant.',
    default: false,
  },
  doc_engine_v1: {
    label: 'Doc engine v1',
    description: 'PDF document generation (PI/CI/PL/COO) with the rule engine.',
    default: false,
  },
  inbox_sync: {
    label: 'Inbox sync',
    description: 'Gmail/IMAP inbound-email ingestion into leads.',
    default: false,
  },
  whatsapp_notifications: {
    label: 'WhatsApp notifications',
    description: 'Outbound WhatsApp alerts for orders and shipments.',
    default: false,
  },
};

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

/**
 * Resolve a flag for a tenant: an explicit FeatureFlag row wins, otherwise the
 * code default. This is the read the product code calls at a gated surface.
 */
export async function isFeatureEnabled(tenantId: string, key: FeatureFlagKey): Promise<boolean> {
  const row = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId, key } },
    select: { enabled: true },
  });
  return row?.enabled ?? FEATURE_FLAGS[key].default;
}

/** All flags for a tenant with their effective (override-or-default) state — for the admin console. */
export async function listTenantFlags(
  tenantId: string,
): Promise<Array<{ key: FeatureFlagKey; label: string; description: string; enabled: boolean; overridden: boolean }>> {
  const rows = await prisma.featureFlag.findMany({ where: { tenantId }, select: { key: true, enabled: true } });
  const overrides = new Map(rows.map((r) => [r.key, r.enabled]));
  return FEATURE_FLAG_KEYS.map((key) => {
    const meta = FEATURE_FLAGS[key];
    const overridden = overrides.has(key);
    return {
      key,
      label: meta.label,
      description: meta.description,
      enabled: overridden ? (overrides.get(key) as boolean) : meta.default,
      overridden,
    };
  });
}
