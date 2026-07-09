'use client';

import { useTransition } from 'react';
import { updateTaskStatus } from '@/actions/tasks';
import { TASK_PRIORITY_COLORS, TASK_PRIORITY_LABELS, TASK_STATUSES, TASK_STATUS_LABELS } from './task-constants';
import type { Task } from '@prisma/client';

export function TaskCard({ task, canWrite }: { task: Task; canWrite: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink">{task.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TASK_PRIORITY_COLORS[task.priority]}`}>
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
      </div>
      {task.description && <p className="mt-1 text-xs text-muted">{task.description}</p>}
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{task.assigneeName}</span>
        {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
      </div>
      {canWrite && (
        <select
          value={task.status}
          disabled={pending}
          onChange={(e) => startTransition(() => updateTaskStatus(task.id, e.target.value as Task['status']))}
          className="mt-3 w-full rounded-lg border border-line px-2 py-1.5 text-xs text-ink disabled:opacity-50"
        >
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
      )}
    </div>
  );
}
