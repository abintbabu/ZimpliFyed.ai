'use client';

import { useState, useTransition } from 'react';
import { createTask } from '@/actions/tasks';
import { ROLE_LABELS } from '@/lib/permissions';
import type { MembershipRole, TaskPriority } from '@prisma/client';

type Member = { id: string; role: MembershipRole; user: { name: string | null; email: string | null } };

export function NewTaskForm({ members }: { members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData) => {
    setError(null);
    const title = String(formData.get('title') ?? '').trim();
    const assigneeUserId = String(formData.get('assigneeUserId') ?? '');
    if (!title || !assigneeUserId) return;
    startTransition(async () => {
      try {
        await createTask({
          title,
          description: String(formData.get('description') ?? ''),
          priority: String(formData.get('priority') ?? 'medium') as TaskPriority,
          assigneeUserId,
          dueDate: String(formData.get('dueDate') ?? '') || undefined,
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create task');
      }
    });
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
        New task
      </button>
    );
  }

  return (
    <form action={submit} className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2">
      <input name="title" required placeholder="Task title" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
      <textarea name="description" placeholder="Description (optional)" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" rows={2} />
      <select name="assigneeUserId" required defaultValue="" className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <option value="" disabled>Assign to…</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.user.name || m.user.email} · {ROLE_LABELS[m.role]}
          </option>
        ))}
      </select>
      <select name="priority" defaultValue="medium" className="rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <option value="low">Low priority</option>
        <option value="medium">Medium priority</option>
        <option value="high">High priority</option>
      </select>
      <input name="dueDate" type="date" className="rounded-lg border border-line px-3 py-2 text-sm text-ink sm:col-span-2" />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Cancel
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
