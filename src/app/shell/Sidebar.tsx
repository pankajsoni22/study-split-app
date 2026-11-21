import { LogIn, LogOut } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { roleLabel } from '../../domain/roles.ts';
import { useAuth } from '../../features/auth/useAuth.ts';
import Avatar from '../../ui/Avatar.tsx';
import Brand from '../../ui/Brand.tsx';
import ThemeSwitch from '../../ui/ThemeSwitch.tsx';
import { visibleItems } from './navItems.ts';

/** Computer screens: brand, navigation by role, theme, and the signed-in user (or Sign in). */
export default function Sidebar() {
  const { status, profile, signOut } = useAuth();
  const { pathname } = useLocation();
  const items = visibleItems(profile?.role, status === 'signedIn');
  const main = items.filter(i => i.group === 'main');
  const admin = items.filter(i => i.group === 'admin');
  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <Brand />
      <nav aria-label="Main" className="nav-section">
        {main.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={linkClass}>
            <i.icon size={18} aria-hidden="true" /> {i.label}
          </NavLink>
        ))}
      </nav>
      {admin.length > 0 && (
        <nav aria-label="Admin" className="nav-section">
          <span className="nav-heading">Admin</span>
          {admin.map(i => (
            <NavLink key={i.to} to={i.to} className={linkClass}>
              <i.icon size={18} aria-hidden="true" /> {i.label}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="sidebar-foot">
        <ThemeSwitch compact />
        {profile ? (
          <div className="sidebar-user">
            <Avatar name={profile.displayName ?? profile.username} url={profile.avatarUrl} />
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{profile.displayName ?? profile.username}</span>
              <span className="sidebar-user-role">@{profile.username} · {roleLabel[profile.role]}</span>
            </span>
            <button type="button" className="icon-btn icon-btn-plain" onClick={() => void signOut()} aria-label="Sign out" title="Sign out">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        ) : status === 'signedOut' && (
          <Link className="btn" to={`/signin?next=${encodeURIComponent(pathname)}`}>
            <LogIn size={17} aria-hidden="true" /> Sign in
          </Link>
        )}
      </div>
    </aside>
  );
}
