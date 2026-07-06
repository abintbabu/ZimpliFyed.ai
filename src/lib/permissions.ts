import type { MembershipRole } from '@prisma/client';

export const ROLE_LABELS: Record<MembershipRole, string> = {
  customer: 'Customer',
  sales: 'Sales',
  finance: 'Finance',
  procurement: 'Procurement',
  production: 'Production',
  logistics: 'Logistics',
  marketing: 'Marketing',
  viewer: 'Viewer',
  admin: 'Admin',
  super_admin: 'Super Admin',
  vendor: 'Vendor',
};

export type Permission =
  | 'users:manage'
  | 'roles:manage'
  | 'customers:read'
  | 'customers:write'
  | 'leads:read'
  | 'leads:write'
  | 'quotes:read'
  | 'quotes:write'
  | 'orders:read'
  | 'orders:write'
  | 'invoices:read'
  | 'invoices:write'
  | 'samples:read'
  | 'samples:write'
  | 'samples:dispatch'
  | 'samples:inventory'
  | 'samples:reconcile'
  | 'analytics:read'
  | 'kanban:read'
  | 'kanban:write'
  | 'expenses:read'
  | 'expenses:write'
  | 'expenses:delete'
  | 'vendors:read'
  | 'vendors:write'
  | 'tasks:read'
  | 'tasks:write';

const ALL_STAFF: Permission[] = [
  'customers:read', 'customers:write', 'leads:read', 'leads:write', 'quotes:read', 'quotes:write',
  'orders:read', 'orders:write', 'invoices:read', 'invoices:write', 'samples:read', 'samples:write',
  'samples:dispatch', 'samples:inventory', 'samples:reconcile', 'analytics:read', 'kanban:read',
  'kanban:write', 'expenses:read', 'expenses:write', 'expenses:delete', 'vendors:read', 'vendors:write',
  'tasks:read', 'tasks:write',
];

export const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  customer: [],
  vendor: [],
  viewer: ['customers:read', 'leads:read', 'quotes:read', 'orders:read', 'invoices:read', 'samples:read', 'analytics:read', 'kanban:read', 'tasks:read'],
  sales: ['customers:read', 'customers:write', 'leads:read', 'leads:write', 'quotes:read', 'quotes:write', 'orders:read', 'samples:read', 'samples:dispatch', 'kanban:read', 'kanban:write', 'vendors:read', 'tasks:read', 'tasks:write'],
  finance: ['customers:read', 'orders:read', 'invoices:read', 'invoices:write', 'analytics:read', 'expenses:read', 'expenses:write', 'vendors:read', 'vendors:write', 'tasks:read'],
  procurement: ['samples:read', 'samples:write', 'samples:inventory', 'samples:reconcile', 'orders:read', 'tasks:read'],
  production: ['orders:read', 'orders:write', 'kanban:read', 'kanban:write', 'tasks:read'],
  logistics: ['orders:read', 'orders:write', 'samples:read', 'samples:dispatch', 'tasks:read'],
  marketing: ['analytics:read'],
  admin: ALL_STAFF,
  super_admin: [...ALL_STAFF, 'users:manage', 'roles:manage'],
};

export function hasPermission(role: MembershipRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
