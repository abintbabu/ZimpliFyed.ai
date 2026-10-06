'use client';

import { useState, useTransition } from 'react';
import { updateMemberRole } from '@/actions/users';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/permissions';
import type { MembershipRole } from '@prisma/client';

/**
 * Role picker for an existing member.
 *
 * Only ASSIGNABLE_ROLES are offered: the list used to be every MembershipRole, which included the
 * zero-permission portal identities (`customer`, `vendor`) — picking one silently locked the member
 * out of the dashboard — and the legacy `super_admin` alias.
 *
 * Errors are rendered rather than swallowed, because the server-side guards now legitimately refuse
 * some changes (last owner, non-owner granting owner) and the user needs to see why.
 */
export function RoleSelect({ membershipId, role }: { membershipId: string; role: MembershipRole }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<MembershipRole>(role);
  const [error, setError] = useState<string | null>(null);

  // A role the member already holds but that we no longer offer (e.g. a legacy super_admin) still
  // needs to render as the current selection, or the dropdown would misreport their access.
  const options: MembershipRole[] = ASSIGNABLE_ROLES.includes(role)
    ? [...ASSIGNABLE_ROLES]
    : [role, ...ASSIGNABLE_ROLES];

  const change = (next: MembershipRole) => {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateMemberRole(membershipId, next);
      } catch (err) {
        setValue(previous);
        setError(err instanceof Error ? err.message : 'Could not change role');
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value as MembershipRole)}
        className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink disabled:opacity-50"
      >
        {options.map((r) => (
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
        ))}
      </select>
      {error && <p className="max-w-[16rem] text-xs text-red-600">{error}</p>}
    </div>
  );
}
