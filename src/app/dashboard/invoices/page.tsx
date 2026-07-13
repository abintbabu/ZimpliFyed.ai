import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { requireTenantSession } from '@/lib/session-tenant';
import { hasPermission } from '@/lib/permissions';
import { listInvoices, listInvoiceTemplates } from '@/actions/invoices';
import { listOrders } from '@/actions/orders';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type DataTableColumn } from '@/components/dashboard/data-table';
import { Badge, statusTone } from '@/components/dashboard/badge';
import { EmptyState } from '@/components/dashboard/empty-state';
import { NewInvoiceForm, type TemplateOption } from './new-invoice-form';
import { InvoiceTemplates } from './invoice-templates';

type Invoice = Awaited<ReturnType<typeof listInvoices>>[number];

function isOverdue(dueDate: Date | null, balanceDue: number, isCreditOrDebitNote: boolean) {
  return !isCreditOrDebitNote && balanceDue > 0 && !!dueDate && dueDate.getTime() < Date.now();
}

export default async function InvoicesPage() {
  const { tenantId, role } = await requireTenantSession();
  if (!hasPermission(role, 'invoices:read')) {
    return <p className="text-sm text-muted">You do not have access to invoices.</p>;
  }

  const canWrite = hasPermission(role, 'invoices:write');
  const [invoices, rawTemplates, orders] = await Promise.all([
    listInvoices(tenantId),
    canWrite ? listInvoiceTemplates(tenantId) : Promise.resolve([]),
    canWrite ? listOrders(tenantId) : Promise.resolve([]),
  ]);

  const templates: TemplateOption[] = rawTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    currency: t.currency,
    dueDays: t.dueDays,
    isCreditOrDebitNote: t.isCreditOrDebitNote,
    lines: Array.isArray(t.lines) ? (t.lines as TemplateOption['lines']) : [],
  }));

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      render: (inv) => (
        <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-ink hover:text-brand transition-colors">
          {inv.invoiceNumber}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (inv) => (
        <Badge tone={statusTone(inv.status)} dot>
          {inv.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'balanceDue',
      header: 'Balance due',
      numeric: true,
      render: (inv) => (
        <span className="inline-flex items-center gap-2">
          {inv.currency} {inv.balanceDue.toFixed(2)}
          {isOverdue(inv.dueDate, inv.balanceDue, inv.isCreditOrDebitNote) && (
            <Badge tone="danger">overdue</Badge>
          )}
        </span>
      ),
    },
    { key: 'dueDate', header: 'Due date', render: (inv) => (inv.dueDate ? inv.dueDate.toLocaleDateString() : '—') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        actions={
          canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              <InvoiceTemplates templates={templates} />
              <NewInvoiceForm
                templates={templates}
                orders={orders.map((o) => ({ id: o.id, orderNumber: o.orderNumber }))}
              />
            </div>
          )
        }
      />

      <DataTable
        columns={columns}
        rows={invoices}
        rowKey={(inv) => inv.id}
        empty={<EmptyState icon={Receipt} title="No invoices yet" description="Invoices you issue against orders will appear here." />}
      />
    </div>
  );
}
