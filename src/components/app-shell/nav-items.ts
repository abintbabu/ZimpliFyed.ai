import type { AppNavItem } from './types';

// Each item's `permission` mirrors the `hasPermission` read-gate the target
// page itself enforces, so the sidebar never advertises a link a role can't
// actually open.
export const DASHBOARD_NAV_ITEMS: AppNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', exact: true },
  { label: 'Daily brief', href: '/dashboard/brief', icon: 'Sunrise' },
  { label: 'Inbox', href: '/dashboard/inbox', icon: 'Inbox', permission: 'inbox:read' },
  { label: 'Cash flow', href: '/dashboard/cash-flow', icon: 'PiggyBank', permission: 'analytics:read' },
  { label: 'Copilot', href: '/dashboard/copilot', icon: 'Sparkles', permission: 'analytics:read' },
  { label: 'Leads', href: '/dashboard/leads', icon: 'Users2', permission: 'leads:read' },
  { label: 'Buyers', href: '/dashboard/buyers', icon: 'Building2', permission: 'customers:read' },
  { label: 'Products', href: '/dashboard/products', icon: 'Boxes', permission: 'products:read' },
  { label: 'Vendors', href: '/dashboard/vendors', icon: 'Truck', permission: 'vendors:read' },
  { label: 'RFQs', href: '/dashboard/rfqs', icon: 'Gavel', permission: 'vendors:read' },
  { label: 'Quotes', href: '/dashboard/quotes', icon: 'FileText', permission: 'quotes:read' },
  { label: 'HS Codes', href: '/dashboard/hs-codes', icon: 'Tags', permission: 'hs_codes:read' },
  { label: 'Orders', href: '/dashboard/orders', icon: 'Package', permission: 'orders:read' },
  { label: 'Invoices', href: '/dashboard/invoices', icon: 'Receipt', permission: 'invoices:read' },
  { label: 'Expenses', href: '/dashboard/expenses', icon: 'ScanLine', permission: 'expenses:read' },
  { label: 'Incentives', href: '/dashboard/incentives', icon: 'PiggyBank', permission: 'incentives:read' },
  { label: 'Compliance', href: '/dashboard/compliance', icon: 'ShieldCheck', permission: 'compliance:read' },
  { label: 'GST prep', href: '/dashboard/gst-prep', icon: 'Calculator', permission: 'compliance:read' },
  { label: 'Screening', href: '/dashboard/screening', icon: 'ShieldAlert', permission: 'compliance:read' },
  { label: 'Tasks', href: '/dashboard/tasks', icon: 'CheckSquare', permission: 'tasks:read' },
  { label: 'Users', href: '/dashboard/users', icon: 'Users2', permission: 'users:manage' },
  { label: 'Audit log', href: '/dashboard/audit', icon: 'ScrollText', permission: 'users:manage' },
  { label: 'Settings', href: '/dashboard/settings', icon: 'Settings' },
];
