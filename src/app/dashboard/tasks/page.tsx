import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listTasks } from '@/actions/tasks';
import { listMembers } from '@/actions/users';
import { TASK_STATUSES, TASK_STATUS_LABELS } from './task-constants';
import { TaskCard } from './task-card';
import { NewTaskForm } from './new-task-form';

export default async function TasksPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'tasks:read')) {
    return <p className="text-sm text-muted">You do not have access to tasks.</p>;
  }

  const canWrite = hasPermission(role, 'tasks:write');
  const [tasks, members] = await Promise.all([listTasks(tenantId), listMembers(tenantId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Tasks</h1>
        {canWrite && <NewTaskForm members={members} />}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-muted">
          No tasks yet. Create one to assign work across the team.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {TASK_STATUSES.map((status) => {
            const statusTasks = tasks.filter((t) => t.status === status);
            return (
              <div key={status} className="w-64 shrink-0 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {TASK_STATUS_LABELS[status]} · {statusTasks.length}
                </p>
                <div className="space-y-2">
                  {statusTasks.map((task) => (
                    <TaskCard key={task.id} task={task} canWrite={canWrite} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
