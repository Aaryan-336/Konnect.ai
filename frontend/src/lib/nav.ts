import {
  Home, Bot, MessageSquare, Database, BarChart3, Shield, Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile dock, where space is tight. */
  short?: string;
  icon: LucideIcon;
  /** Empty means "any signed-in user". */
  roles: string[];
  /** Groups the desktop rail into labelled sections. */
  group: 'workspace' | 'manage';
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: Home, roles: [], group: 'workspace' },
  { href: '/dashboard/agents', label: 'Agents', icon: Bot, roles: [], group: 'workspace' },
  { href: '/dashboard/conversations', label: 'Conversations', short: 'Chats', icon: MessageSquare, roles: [], group: 'workspace' },
  { href: '/dashboard/knowledge', label: 'Knowledge', icon: Database, roles: ['KNOWLEDGE_ADMIN', 'ADMIN', 'SUPER_ADMIN'], group: 'manage' },
  { href: '/dashboard/admin', label: 'Analytics', icon: BarChart3, roles: ['ADMIN', 'SUPER_ADMIN'], group: 'manage' },
  { href: '/dashboard/admin/audit', label: 'Audit', icon: Shield, roles: ['ADMIN', 'SUPER_ADMIN'], group: 'manage' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: [], group: 'manage' },
];

export function canAccess(item: Pick<NavItem, 'roles'>, userRoles?: string[]) {
  if (item.roles.length === 0) return true;
  return userRoles?.some((r) => item.roles.includes(r)) ?? false;
}

/**
 * `/dashboard` must match exactly — every other route starts with it, so a
 * prefix test would light up Home on every page.
 */
export function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  // `/dashboard/admin` must not claim `/dashboard/admin/audit`, which is its
  // own nav entry.
  if (href === '/dashboard/admin') {
    return pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/users');
  }
  return pathname === href || pathname.startsWith(href + '/');
}

/** The four dock slots that flank the mic. Always valid for any role. */
export const DOCK_ITEMS: NavItem[] = [
  NAV_ITEMS[0],
  NAV_ITEMS[1],
  NAV_ITEMS[2],
];
