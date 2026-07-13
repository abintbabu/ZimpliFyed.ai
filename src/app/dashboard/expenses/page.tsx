import { redirect } from 'next/navigation';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listExpenses } from '@/actions/expenses';
import { listOrders } from '@/actions/orders';
import { PageHeader } from '@/components/dashboard/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { SnapExpenseForm } from './snap-expense-form';
import { ExpenseReviewList } from './expense-review-list';

export default async function ExpensesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'expenses:read')) redirect('/dashboard');

  const [expenses, orders] = await Promise.all([listExpenses(tenantId), listOrders(tenantId)]);
  const canWrite = hasPermission(role, 'expenses:write');

  const pendingCount = expenses.filter((e) => e.status === 'pending_review').length;
  const booked = expenses.filter((e) => e.status === 'auto_posted' || e.status === 'approved');
  const bookedTotal = booked.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const itcTotal = booked.filter((e) => e.itcEligible).reduce((sum, e) => sum + (e.amount ?? 0), 0);

  const orderOptions = orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Snap a receipt, invoice, or UPI screenshot. AI reads the amount, GST head, and ITC eligibility, then either books it or asks you to confirm."
        actions={canWrite && <SnapExpenseForm orders={orderOptions} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting your review" value={pendingCount} tone={pendingCount > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Booked expenses" value={bookedTotal.toFixed(2)} />
        <StatCard label="ITC-eligible booked" value={itcTotal.toFixed(2)} tone="success" />
      </div>

      <ExpenseReviewList expenses={expenses} orders={orderOptions} canWrite={canWrite} />
    </div>
  );
}
