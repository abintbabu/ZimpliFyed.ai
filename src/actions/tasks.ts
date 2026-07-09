'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import type { TaskLinkedType, TaskPriority, TaskStatus } from '@prisma/client';

export async function listTasks(tenantId: string) {
  return prisma.task.findMany({
    where: { tenantId },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function createTask(input: {
  title: string;
  description?: string;
  priority: TaskPriority;
  assigneeUserId: string;
  linkedType?: TaskLinkedType;
  linkedId?: string;
  linkedLabel?: string;
  dueDate?: string;
}) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'tasks:write')) throw new Error('You do not have permission to create tasks');
  if (!input.title.trim()) throw new Error('Title is required');

  const assignee = await prisma.membership.findFirst({
    where: { id: input.assigneeUserId, tenantId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!assignee) throw new Error('Assignee not found');

  const task = await prisma.task.create({
    data: {
      tenantId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      assigneeUserId: assignee.userId,
      assigneeName: assignee.user.name || assignee.user.email || 'Unknown',
      assigneeRole: assignee.role,
      linkedType: input.linkedType ?? 'general',
      linkedId: input.linkedId || null,
      linkedLabel: input.linkedLabel?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdByUserId: userId,
    },
  });

  await writeAudit({
    session,
    collection: 'tasks',
    documentId: task.id,
    action: 'create',
    summary: `Created task ${task.title}`,
    after: { title: task.title, assigneeName: task.assigneeName, priority: task.priority },
  });

  revalidatePath('/dashboard/tasks');
  return task;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'tasks:write')) throw new Error('You do not have permission to update tasks');

  const before = await prisma.task.findFirst({ where: { id: taskId, tenantId } });
  if (!before) throw new Error('Task not found');

  await prisma.task.update({
    where: { id: taskId, tenantId },
    data: { status, completedAt: status === 'done' ? new Date() : null },
  });

  await writeAudit({
    session,
    collection: 'tasks',
    documentId: taskId,
    action: 'update',
    summary: `Moved task ${before.title} to ${status}`,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath('/dashboard/tasks');
}
