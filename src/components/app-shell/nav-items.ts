import { LayoutDashboard, Users2, CheckSquare, Settings, Truck, FileText, Receipt, Package, ScrollText, Gavel, Sparkles, Tags, ShieldCheck, ShieldAlert, PiggyBank } from 'lucide-react';
import type { AppNavItem } from './types';

export const DASHBOARD_NAV_ITEMS: AppNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Copilot', href: '/dashboard/copilot', icon: Sparkles },
  { label: 'Leads', href: '/dashboard/leads', icon: Users2 },
  { label: 'Vendors', href: '/dashboard/vendors', icon: Truck },
  { label: 'RFQs', href: '/dashboard/rfqs', icon: Gavel },
  { label: 'Quotes', href: '/dashboard/quotes', icon: FileText },
  { label: 'HS Codes', href: '/dashboard/hs-codes', icon: Tags },
  { label: 'Orders', href: '/dashboard/orders', icon: Package },
  { label: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
  { label: 'Incentives', href: '/dashboard/incentives', icon: PiggyBank },
  { label: 'Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
  { label: 'Screening', href: '/dashboard/screening', icon: ShieldAlert },
  { label: 'Tasks', href: '/dashboard/tasks', icon: CheckSquare },
  { label: 'Users', href: '/dashboard/users', icon: Users2, roles: ['admin', 'super_admin'] },
  { label: 'Audit log', href: '/dashboard/audit', icon: ScrollText, roles: ['admin', 'super_admin'] },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['admin', 'super_admin'] },
];
