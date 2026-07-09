'use client';

import { useTransition } from 'react';
import { switchTenant } from '@/actions/onboarding';
import { ROLE_LABELS } from '@/lib/permissions';
import type { MembershipRole } from '@prisma/client';

type Membership = { tenantId: string; tenantSlug: string; role: MembershipRole };

export function TenantSwitcher({ memberships, activeSlug }: { memberships: Membership[]; activeSlug: string }) {
  const [pending, start] = useTransition();
  if (memberships.length < 2) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">Workspace</span>
      <select
        value={activeSlug}
        disabled={pending}
        onChange={(e) => start(async () => { await switchTenant(e.target.value); })}
        className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand"
      >
        {memberships.map((m) => (
          <option key={m.tenantId} value={m.tenantSlug}>
            {m.tenantSlug} — {ROLE_LABELS[m.role]}
          </option>
        ))}
      </select>
    </label>
  );
}
