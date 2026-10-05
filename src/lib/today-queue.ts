import type { LeadStage } from '@prisma/client';
import { complianceStatus } from '@/lib/compliance-deadlines';
import { leadSla } from '@/lib/lead-sla';
import type { Permission } from '@/lib/permissions';

/**
 * The Today queue: one ranked, side-effect-free list of everything that needs the founder now —
 * overdue follow-ups, tasks due, unpaid invoices, accepted quotes with no order, shipped orders with
 * no invoice, expiring compliance items, and the count of AI proposals awaiting approval.
 *
 * It is a read-only view over existing records; the Action Queue stays the only approve/reject
 * surface. Pure so ordering and severity rules are unit-testable (`npm run test:today`).
 */

export type TodayKind = 'lead' | 'task' | 'invoice' | 'quote' | 'order' | 'compliance' | 'action';
export type TodaySeverity = 'overdue' | 'due' | 'soon';

export interface TodayItem {
  id: string;
  kind: TodayKind;
  severity: TodaySeverity;
  title: string;
  subtitle: string;
  href: string;
  /** Whole days overdue / waiting (0 when merely due today or upcoming). */
  days: number;
  /** Permission needed to open `href`, so a role never sees a row it cannot act on. */
  requires: Permission;
}

const MS_PER_DAY = 86_400_000;
const SEVERITY_WEIGHT: Record<TodaySeverity, number> = { overdue: 2, due: 1, soon: 0 };
/** A task due within this many days (and not yet overdue) shows as "soon". */
const TASK_SOON_DAYS = 2;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (later: Date, earlier: Date) =>
  Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / MS_PER_DAY);

export interface QueueLead {
  id: string;
  name: string;
  company: string | null;
  stage: LeadStage;
  nextFollowUpAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface QueueTask {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  linkedLabel: string | null;
}
export interface QueueInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  dueDate: Date | null;
  balanceDue: number;
  currency: string;
  isCreditOrDebitNote: boolean;
}
export interface QueueQuote {
  id: string;
  quoteNumber: string;
  updatedAt: Date;
}
export interface QueueOrder {
  id: string;
  orderNumber: string;
  updatedAt: Date;
}
export interface QueueCompliance {
  id: string;
  name: string;
  expiresAt: Date | null;
  renewalLeadDays: number;
}

export interface TodayInput {
  leads?: QueueLead[];
  tasks?: QueueTask[];
  invoices?: QueueInvoice[];
  /** Accepted quotes that have no order yet. */
  acceptedQuotesWithoutOrder?: QueueQuote[];
  /** Shipped / delivered orders that have no invoice yet. */
  shippedOrdersWithoutInvoice?: QueueOrder[];
  compliance?: QueueCompliance[];
  pendingActionCount?: number;
}

export function buildTodayQueue(input: TodayInput, now: Date = new Date()): TodayItem[] {
  const items: TodayItem[] = [];

  for (const lead of input.leads ?? []) {
    const sla = leadSla(lead, now);
    if (!sla) continue;
    items.push({
      id: `lead:${lead.id}`,
      kind: 'lead',
      severity: sla.level === 'overdue' ? 'overdue' : 'due',
      title: lead.company?.trim() || lead.name,
      subtitle: sla.label,
      href: '/dashboard/leads',
      days: sla.days,
      requires: 'leads:read',
    });
  }

  for (const task of input.tasks ?? []) {
    if (!task.dueDate || (task.status !== 'open' && task.status !== 'in_progress')) continue;
    const overdueDays = dayDiff(now, task.dueDate);
    let severity: TodaySeverity;
    if (overdueDays > 0) severity = 'overdue';
    else if (overdueDays === 0) severity = 'due';
    else if (-overdueDays <= TASK_SOON_DAYS) severity = 'soon';
    else continue;
    items.push({
      id: `task:${task.id}`,
      kind: 'task',
      severity,
      title: task.title,
      subtitle:
        severity === 'overdue' ? `Task ${overdueDays}d overdue` : severity === 'due' ? 'Task due today' : `Task due in ${-overdueDays}d`,
      href: '/dashboard/tasks',
      days: Math.max(overdueDays, 0),
      requires: 'tasks:read',
    });
  }

  for (const inv of input.invoices ?? []) {
    if (inv.isCreditOrDebitNote || inv.balanceDue <= 0 || inv.status === 'void' || inv.status === 'paid' || !inv.dueDate) continue;
    const overdueDays = dayDiff(now, inv.dueDate);
    if (overdueDays < 0) continue;
    items.push({
      id: `invoice:${inv.id}`,
      kind: 'invoice',
      severity: overdueDays > 0 ? 'overdue' : 'due',
      title: `Invoice ${inv.invoiceNumber}`,
      subtitle: `${inv.balanceDue.toFixed(2)} ${inv.currency} ${overdueDays > 0 ? `${overdueDays}d overdue` : 'due today'}`,
      href: `/dashboard/invoices/${inv.id}`,
      days: overdueDays,
      requires: 'invoices:read',
    });
  }

  for (const q of input.acceptedQuotesWithoutOrder ?? []) {
    items.push({
      id: `quote:${q.id}`,
      kind: 'quote',
      severity: 'due',
      title: `Quote ${q.quoteNumber} accepted`,
      subtitle: 'Create the order',
      href: `/dashboard/quotes/${q.id}`,
      days: Math.max(dayDiff(now, q.updatedAt), 0),
      requires: 'orders:write',
    });
  }

  for (const o of input.shippedOrdersWithoutInvoice ?? []) {
    items.push({
      id: `order:${o.id}`,
      kind: 'order',
      severity: 'due',
      title: `Order ${o.orderNumber} shipped`,
      subtitle: 'Bill the customer',
      href: `/dashboard/orders/${o.id}`,
      days: Math.max(dayDiff(now, o.updatedAt), 0),
      requires: 'invoices:write',
    });
  }

  for (const c of input.compliance ?? []) {
    const status = complianceStatus(c.expiresAt, c.renewalLeadDays);
    if (status !== 'expired' && status !== 'expiring_soon') continue;
    const expiredDays = c.expiresAt ? dayDiff(now, c.expiresAt) : 0;
    items.push({
      id: `compliance:${c.id}`,
      kind: 'compliance',
      severity: status === 'expired' ? 'overdue' : 'soon',
      title: c.name,
      subtitle: status === 'expired' ? `Expired ${expiredDays}d ago — renew it` : `Expires in ${-expiredDays}d — start renewal`,
      href: '/dashboard/compliance',
      days: Math.max(expiredDays, 0),
      requires: 'compliance:read',
    });
  }

  if ((input.pendingActionCount ?? 0) > 0) {
    const n = input.pendingActionCount!;
    items.push({
      id: 'action:pending',
      kind: 'action',
      severity: 'due',
      title: `${n} proposal${n > 1 ? 's' : ''} awaiting your approval`,
      subtitle: 'Review in the action queue',
      href: '/dashboard/action-queue',
      days: 0,
      requires: 'action_queue:read',
    });
  }

  return items.sort(
    (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || b.days - a.days || a.title.localeCompare(b.title),
  );
}
