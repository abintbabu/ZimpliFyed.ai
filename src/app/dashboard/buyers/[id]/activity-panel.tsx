'use client';

import { useState, useTransition } from 'react';
import { createActivity, completeActivity } from '@/actions/buyers';
import type { Activity, ActivityKind } from '@prisma/client';

const KINDS: ActivityKind[] = ['call', 'email', 'whatsapp', 'meeting', 'note'];

export function ActivityPanel({ buyerId, activities }: { buyerId: string; activities: Activity[] }) {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<ActivityKind>('note');
  const [subject, setSubject] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!subject.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createActivity({ entityType: 'buyer', entityId: buyerId, kind, subject });
        setSubject('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to log activity');
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ActivityKind)}
          className="rounded-lg border border-line px-2 py-2 text-sm text-ink"
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What happened / next step…"
          className="flex-1 min-w-[200px] rounded-lg border border-line px-3 py-2 text-sm text-ink"
        />
        <button onClick={submit} disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Log
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <ul className="space-y-2">
        {activities.map((a) => (
          <li key={a.id} className="flex items-start justify-between rounded-xl border border-line bg-white p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{a.kind}</p>
              <p className="text-sm text-ink">{a.subject}</p>
              <p className="text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
            {a.dueAt && !a.doneAt && (
              <button
                onClick={() => startTransition(() => completeActivity(a.id))}
                className="text-xs text-brand hover:underline"
              >
                Mark done
              </button>
            )}
          </li>
        ))}
        {activities.length === 0 && <p className="text-sm text-muted">No activity logged yet.</p>}
      </ul>
    </div>
  );
}
