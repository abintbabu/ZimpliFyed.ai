import { LayoutDashboard, Users2, CheckSquare, Settings, Truck, FileText, Receipt, Package } from 'lucide-react';
import type { AppNavItem } from './types';

export const DASHBOARD_NAV_ITEMS: AppNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
  { label: 'Leads', href: '/dashboard/leads', icon: Users2 },
  { label: 'Vendors', href: '/dashboard/vendors', icon: Truck },
  { label: 'Quotes', href: '/dashboard/quotes', icon: FileText },
  { label: 'Orders', href: '/dashboard/orders', icon: Package },
  { label: 'Invoices', href: '/dashboard/invoices', icon: Receipt },
  { label: 'Tasks', href: '/dashboard/tasks', icon: CheckSquare },
  { label: 'Users', href: '/dashboard/users', icon: Users2, roles: ['admin', 'super_admin'] },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, roles: ['admin', 'super_admin'] },
];
