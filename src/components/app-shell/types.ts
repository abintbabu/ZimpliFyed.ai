import type { MembershipRole } from '@prisma/client';
import type { NavIconName } from './nav-icons';

export type AppNavChild = {
  label: string;
  href: string;
};

export type AppNavItem = {
  label: string;
  href: string;
  icon: NavIconName;
  roles?: MembershipRole[];
  /** Match this item only on an exact path. */
  exact?: boolean;
  children?: AppNavChild[];
  badge?: number;
};

export function isNavVisible(item: AppNavItem, role: MembershipRole | null | undefined): boolean {
  if (!item.roles) return true;
  if (!role) return false;
  return item.roles.includes(role);
}

/** Prefix-aware active check. */
export function isPathActive(pathname: string, href: string, exact = false): boolean {
  if (pathname === href) return true;
  if (exact) return false;
  return pathname.startsWith(href + '/');
}

export function isSectionOpen(pathname: string, item: AppNavItem): boolean {
  if (!item.children) return false;
  return (
    isPathActive(pathname, item.href, item.exact) ||
    item.children.some(child => isPathActive(pathname, child.href))
  );
}
