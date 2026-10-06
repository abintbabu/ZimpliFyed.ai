'use client';

import { useState, useTransition } from 'react';
import { removeMember } from '@/actions/users';

/**
 * Offboarding control. Removing access is destructive and not obviously reversible to the person
 * clicking, so it asks for an explicit second click rather than firing on the first — and it
 * renders the server's refusal (last owner, owner removing owner) instead of failing silently.
 */
export function RemoveMemberButton({
  membershipId,
  email,
  isSelf,
}: {
  membershipId: string;
  email: string | null;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    setError(null);
    startTransition(async () => {
      try {
        await removeMember(membershipId);
      } catch (err) {
        setConfirming(false);
        setError(err instanceof Error ? err.message : 'Could not remove member');
      }
    });
  };

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-red-600 hover:underline"
        >
          {isSelf ? 'Leave' : 'Remove'}
        </button>
        {error && <p className="max-w-[16rem] text-left text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-xs text-muted">
        {isSelf
          ? 'Leave this workspace? You will lose access immediately.'
          : `Remove ${email ?? 'this member'}? They lose access immediately.`}
      </p>
      <div className="flex gap-2">
        <button
          onClick={remove}
          disabled={pending}
          className="rounded-lg bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Removing…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-xs font-medium text-muted hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
