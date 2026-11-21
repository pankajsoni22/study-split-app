import { FilePen, FileText, Home, Settings, SlidersHorizontal, UserCog, type LucideIcon } from 'lucide-react';
import { can } from '../../domain/roles.ts';
import type { Role } from '../../domain/types.ts';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  group: 'main' | 'admin';
  /** Who sees it: everyone, any signed-in user, writers, or admins. */
  show: 'all' | 'signedIn' | 'write' | 'admin';
  /** Hidden on phones (the app is read-only below 768 px, D9). */
  desktopOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true, group: 'main', show: 'all' },
  { to: '/me/articles', label: 'My articles', icon: FileText, group: 'main', show: 'write' },
  { to: '/write/new', label: 'New article', icon: FilePen, group: 'main', show: 'write', desktopOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, group: 'main', show: 'signedIn' },
  { to: '/admin/users', label: 'Users', icon: UserCog, group: 'admin', show: 'admin' },
  { to: '/admin/settings', label: 'App settings', icon: SlidersHorizontal, group: 'admin', show: 'admin' }
];

export function visibleItems(role: Role | undefined, signedIn: boolean): NavItem[] {
  return NAV_ITEMS.filter(i =>
    i.show === 'all' || (i.show === 'signedIn' && signedIn) || (i.show === 'write' && can.write(role)) || (i.show === 'admin' && can.admin(role)));
}
