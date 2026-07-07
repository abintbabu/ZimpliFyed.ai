'use client';

import { useTransition } from 'react';
import { updateMemberRole } from '@/actions/users';
import { ROLE_LABELS } from '@/lib/permissions';
import type { MembershipRole } from '@prisma/client';

export function RoleSelect({ membershipId, role }: { membershipId: string; role: MembershipRole }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={role}
      disabled={pending}
      onChange={(e) => startTransition(() => updateMemberRole(membershipId, e.target.value as MembershipRole))}
      className="rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink disabled:opacity-50"
    >
      {Object.entries(ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}
