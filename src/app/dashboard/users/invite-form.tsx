'use client';

import { useState, useTransition } from 'react';
import { inviteUser } from '@/actions/users';
import { ROLE_LABELS } from '@/lib/permissions';
import type { MembershipRole } from '@prisma/client';

const INVITABLE_ROLES: MembershipRole[] = ['viewer', 'sales', 'finance', 'admin'];

export function InviteUserForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('viewer');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const value = String(formData.get('email') ?? '').trim();
    if (!value) return;
    startTransition(async () => {
      try {
        await inviteUser(value, role);
        setEmail('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to invite user');
      }
    });
  };

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex-1 min-w-[200px]">
        <label className="mb-1 block text-xs font-medium text-muted">Email</label>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MembershipRole)}
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
        >
          {INVITABLE_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Inviting…' : 'Invite'}
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
