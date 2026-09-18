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
  owner: 'Owner',
  ops_admin: 'Ops Admin',
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
  | 'products:read'
  | 'products:write'
  | 'tasks:read'
  | 'tasks:write'
  | 'compliance:read'
  | 'compliance:write'
  | 'hs_codes:read'
  | 'hs_codes:write'
  | 'incentives:read'
  | 'incentives:write'
  | 'inbox:read'
  | 'inbox:write'
  | 'action_queue:read'
  | 'action_queue:approve'
  // EXPORT_OS_MASTER_PLAN §6.2 — owner/admin split, Wave 0.
  | 'billing:manage'
  | 'members:invite'
  | 'members:remove'
  | 'roles:assign'
  | 'branding:manage'
  | 'settings:manage'
  | 'domains:manage'
  | 'integrations:manage'
  | 'numbering:manage'
  | 'terms:manage'
  | 'ai:configure'
  | 'data:export'
  | 'org:transfer'
  | 'org:delete'
  | 'support_access:grant'
  | 'reports:pnl';

const ALL_STAFF: Permission[] = [
  'customers:read', 'customers:write', 'leads:read', 'leads:write', 'quotes:read', 'quotes:write',
  'orders:read', 'orders:write', 'invoices:read', 'invoices:write', 'samples:read', 'samples:write',
  'samples:dispatch', 'samples:inventory', 'samples:reconcile', 'analytics:read', 'kanban:read',
  'kanban:write', 'expenses:read', 'expenses:write', 'expenses:delete', 'vendors:read', 'vendors:write',
  'products:read', 'products:write', 'tasks:read', 'tasks:write', 'compliance:read', 'compliance:write',
  'hs_codes:read', 'hs_codes:write', 'incentives:read', 'incentives:write',
  'inbox:read', 'inbox:write', 'action_queue:read', 'action_queue:approve',
];

// EXPORT_OS_MASTER_PLAN §6.2 — everything an admin runs the business with, beyond ALL_STAFF,
// short of the five calls that change what we charge, where the tenant lives on the internet,
// or who else has God access (OWNER_ONLY below).
const ADMIN_EXTRA: Permission[] = [
  'members:invite', 'members:remove', 'roles:assign', 'branding:manage', 'settings:manage',
  'integrations:manage', 'numbering:manage', 'terms:manage', 'ai:configure', 'data:export', 'reports:pnl',
];

// Owner-exclusive: billing, domains, transferring/deleting the org, granting support access.
const OWNER_ONLY: Permission[] = ['billing:manage', 'domains:manage', 'org:transfer', 'org:delete', 'support_access:grant'];

// ops_admin (ported from Anabyn, §6.2): full admin reach minus the expense ledger and P&L —
// the role an operations lead actually needs.
const OPS_ADMIN: Permission[] = [...ALL_STAFF, ...ADMIN_EXTRA].filter(
  (p) => p !== 'expenses:read' && p !== 'expenses:write' && p !== 'expenses:delete' && p !== 'reports:pnl',
);

export const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  customer: [],
  vendor: [],
  viewer: ['customers:read', 'leads:read', 'quotes:read', 'orders:read', 'invoices:read', 'samples:read', 'analytics:read', 'kanban:read', 'tasks:read', 'compliance:read', 'products:read', 'hs_codes:read', 'incentives:read', 'inbox:read', 'action_queue:read'],
  sales: ['customers:read', 'customers:write', 'leads:read', 'leads:write', 'quotes:read', 'quotes:write', 'orders:read', 'samples:read', 'samples:dispatch', 'kanban:read', 'kanban:write', 'vendors:read', 'tasks:read', 'tasks:write', 'products:read', 'products:write', 'hs_codes:read', 'hs_codes:write', 'inbox:read', 'inbox:write', 'action_queue:read', 'action_queue:approve'],
  finance: ['customers:read', 'orders:read', 'invoices:read', 'invoices:write', 'analytics:read', 'expenses:read', 'expenses:write', 'vendors:read', 'vendors:write', 'tasks:read', 'compliance:read', 'compliance:write', 'products:read', 'incentives:read', 'incentives:write', 'action_queue:read', 'action_queue:approve'],
  procurement: ['samples:read', 'samples:write', 'samples:inventory', 'samples:reconcile', 'orders:read', 'tasks:read', 'products:read'],
  production: ['orders:read', 'orders:write', 'kanban:read', 'kanban:write', 'tasks:read', 'products:read'],
  logistics: ['orders:read', 'orders:write', 'samples:read', 'samples:dispatch', 'tasks:read', 'compliance:read', 'products:read'],
  marketing: ['analytics:read', 'products:read'],
  admin: [...ALL_STAFF, ...ADMIN_EXTRA],
  ops_admin: OPS_ADMIN,
  // Expand step (EXPORT_OS_MASTER_PLAN §6.1): owner and super_admin are treated identically
  // everywhere until scripts/backfill-owner-role.ts runs and super_admin is dropped in a later
  // contract step — both get the full permission set, including OWNER_ONLY.
  owner: [...ALL_STAFF, ...ADMIN_EXTRA, ...OWNER_ONLY, 'users:manage', 'roles:manage'],
  super_admin: [...ALL_STAFF, ...ADMIN_EXTRA, ...OWNER_ONLY, 'users:manage', 'roles:manage'],
};

export function hasPermission(role: MembershipRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
