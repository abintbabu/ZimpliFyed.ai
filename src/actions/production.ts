'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import { allocateDocNumber } from '@/lib/doc-number-alloc';
import { qcVerdict, type Defect } from '@/lib/qc';

const DEFAULT_STAGES = ['Materials ready', 'In production', 'Finishing', 'Packing'];

export async function listProductionRuns() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) return [];
  const runs = await prisma.productionRun.findMany({ where: { tenantId }, include: { stages: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  const orderIds = runs.map((r) => r.orderId).filter((x): x is string => !!x);
  const orders = orderIds.length ? await prisma.order.findMany({ where: { tenantId, id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [];
  return runs.map((r) => ({ ...r, orderNumber: orders.find((o) => o.id === r.orderId)?.orderNumber ?? null }));
}

export async function createProductionRun(input: { productDescription: string; plannedQty: number; orderId?: string; dueDate?: string; stages?: string[] }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to plan production');
  const description = input.productDescription.trim();
  if (!description) throw new Error('Describe what is being produced');
  if (!(input.plannedQty > 0)) throw new Error('Planned quantity must be above 0');
  if (input.orderId && !(await prisma.order.findFirst({ where: { id: input.orderId, tenantId }, select: { id: true } }))) throw new Error('Order not found');
  let dueDate: Date | null = null;
  if (input.dueDate) { dueDate = new Date(`${input.dueDate}T00:00:00Z`); if (Number.isNaN(dueDate.getTime())) throw new Error('Due date is not valid'); }

  const stages = (input.stages?.length ? input.stages : DEFAULT_STAGES).map((s) => s.trim()).filter(Boolean);
  const runNumber = await allocateDocNumber(tenantId, 'RUN');
  const run = await prisma.productionRun.create({
    data: { tenantId, runNumber, orderId: input.orderId || null, productDescription: description, plannedQty: input.plannedQty, dueDate, createdByUserId: userId, stages: { create: stages.map((name, i) => ({ name, sortOrder: i })) } },
  });
  await writeAudit({ session, collection: 'production_runs', documentId: run.id, action: 'create', summary: `Planned ${runNumber}: ${description} × ${input.plannedQty}`, after: { runNumber } });
  revalidatePath('/dashboard/production');
  return run;
}

export async function setStageDone(runId: string, stageId: string, done: boolean) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to update production');
  const run = await prisma.productionRun.findFirst({ where: { id: runId, tenantId }, select: { id: true, status: true } });
  if (!run) throw new Error('Production run not found');
  if (run.status === 'cancelled' || run.status === 'completed') throw new Error(`A ${run.status} run cannot be changed`);
  await prisma.productionStage.updateMany({ where: { id: stageId, runId }, data: { completedAt: done ? new Date() : null } });
  if (run.status === 'planned' && done) await prisma.productionRun.update({ where: { id: runId, tenantId }, data: { status: 'in_progress', startDate: new Date() } });
  revalidatePath('/dashboard/production');
}

export async function setProducedQty(runId: string, qty: number) {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to update production');
  if (!(qty >= 0) || !Number.isFinite(qty)) throw new Error('Produced quantity cannot be negative');
  const res = await prisma.productionRun.updateMany({ where: { id: runId, tenantId, status: { in: ['planned', 'in_progress'] } }, data: { producedQty: qty } });
  if (res.count === 0) throw new Error('Run not found or already closed');
  revalidatePath('/dashboard/production');
}

export async function setRunStatus(runId: string, status: 'completed' | 'cancelled') {
  const session = await requireTenantSession();
  const { tenantId, role } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to update production');
  const run = await prisma.productionRun.findFirst({ where: { id: runId, tenantId }, include: { stages: true } });
  if (!run) throw new Error('Production run not found');
  if (run.status === 'completed' || run.status === 'cancelled') throw new Error(`A ${run.status} run is already closed`);
  if (status === 'completed' && run.stages.some((s) => !s.completedAt)) throw new Error('Finish every stage before completing the run');
  await prisma.productionRun.update({ where: { id: runId, tenantId }, data: { status } });
  await writeAudit({ session, collection: 'production_runs', documentId: runId, action: 'status_change', summary: `${run.runNumber}: ${run.status} → ${status}`, before: { status: run.status }, after: { status } });
  revalidatePath('/dashboard/production');
}

// ── Quality inspections ──────────────────────────────────────────────────────

export async function listQcInspections() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'orders:read')) return [];
  const rows = await prisma.qcInspection.findMany({ where: { tenantId }, include: { defects: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  const orderIds = rows.map((r) => r.orderId).filter((x): x is string => !!x);
  const orders = orderIds.length ? await prisma.order.findMany({ where: { tenantId, id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [];
  return rows.map((r) => ({ ...r, orderNumber: orders.find((o) => o.id === r.orderId)?.orderNumber ?? null }));
}

/** Records an inspection and derives its result from the defects (see qc.ts — a simplified screen, not ISO 2859-1). */
export async function createQcInspection(input: { orderId?: string; runId?: string; kind: 'inline' | 'final'; sampleSize: number; aqlMajor: number; aqlMinor: number; inspector?: string; inspectedAt?: string; notes?: string; defects: { description: string; severity: Defect['severity']; count: number }[] }) {
  const session = await requireTenantSession();
  const { tenantId, role, userId } = session;
  if (!hasPermission(role, 'orders:write')) throw new Error('You do not have permission to record inspections');
  if (!input.orderId && !input.runId) throw new Error('Link the inspection to an order or a production run');
  if (input.orderId && !(await prisma.order.findFirst({ where: { id: input.orderId, tenantId }, select: { id: true } }))) throw new Error('Order not found');
  if (input.runId && !(await prisma.productionRun.findFirst({ where: { id: input.runId, tenantId }, select: { id: true } }))) throw new Error('Production run not found');
  for (const a of [input.aqlMajor, input.aqlMinor]) if (!(a >= 0 && a <= 100)) throw new Error('AQL limits must be between 0 and 100');

  const defects = input.defects.filter((d) => d.description.trim() && d.count > 0);
  for (const d of defects) if (!Number.isInteger(d.count)) throw new Error('Defect counts must be whole numbers');
  const verdict = qcVerdict({ sampleSize: input.sampleSize, defects, aqlMajor: input.aqlMajor, aqlMinor: input.aqlMinor }); // throws on a bad sample size
  let inspectedAt = new Date();
  if (input.inspectedAt) { inspectedAt = new Date(`${input.inspectedAt}T00:00:00Z`); if (Number.isNaN(inspectedAt.getTime())) throw new Error('Inspection date is not valid'); }

  const inspectionNumber = await allocateDocNumber(tenantId, 'QC');
  const row = await prisma.qcInspection.create({
    data: {
      tenantId, inspectionNumber, orderId: input.orderId || null, runId: input.runId || null, kind: input.kind, sampleSize: input.sampleSize,
      aqlMajor: input.aqlMajor, aqlMinor: input.aqlMinor, result: verdict.result, inspectedAt, inspector: input.inspector?.trim() || null, notes: input.notes?.trim() || null, createdByUserId: userId,
      defects: { create: defects.map((d) => ({ description: d.description.trim(), severity: d.severity, count: d.count })) },
    },
  });
  await writeAudit({ session, collection: 'qc_inspections', documentId: row.id, action: 'create', summary: `${inspectionNumber}: ${verdict.result.toUpperCase()}${verdict.reasons.length ? ` — ${verdict.reasons[0]}` : ''}`, after: { result: verdict.result } });
  revalidatePath('/dashboard/production');
  return { inspection: row, verdict };
}
