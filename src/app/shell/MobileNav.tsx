import { Ellipsis, LogIn, LogOut } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { roleLabel } from '../../domain/roles.ts';
import { useAuth } from '../../features/auth/useAuth.ts';
import Avatar from '../../ui/Avatar.tsx';
import Brand from '../../ui/Brand.tsx';
import ThemeSwitch from '../../ui/ThemeSwitch.tsx';
import { visibleItems } from './navItems.ts';

/** Phones: a slim top bar. */
export function MobileTop() {
  const { status, profile } = useAuth();
  const { pathname } = useLocation();
  return (
    <header className="mobile-top">
      <Brand subtitle={null} />
      <span className="mobile-top-actions">
        {profile
          ? <Avatar name={profile.displayName ?? profile.username} url={profile.avatarUrl} />
          : status === 'signedOut' && (
            <Link className="btn btn-sm" to={`/signin?next=${encodeURIComponent(pathname)}`}><LogIn size={15} aria-hidden="true" /> Sign in</Link>
          )}
      </span>
    </header>
  );
}

/** Phones: bottom tabs (main pages) + a "More" sheet with admin pages, theme and sign-out. */
export function TabBar() {
  const { status, profile, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const items = visibleItems(profile?.role, status === 'signedIn').filter(i => !i.desktopOnly);
  const tabs = items.filter(i => i.group === 'main').slice(0, 3);
  const more = items.filter(i => i.group === 'admin');
  const moreActive = more.some(i => pathname.startsWith(i.to));

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        {tabs.map(i => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `tab${isActive ? ' active' : ''}`}>
            <i.icon size={22} aria-hidden="true" />
            {i.label}
          </NavLink>
        ))}
        <button type="button" className={`tab${moreActive ? ' active' : ''}`} aria-haspopup="dialog" aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}>
          <Ellipsis size={22} aria-hidden="true" />
          More
        </button>
      </nav>
      {moreOpen && (
        <MoreSheet onClose={() => setMoreOpen(false)}>
          {profile && (
            <div className="sheet-user">
              <Avatar name={profile.displayName ?? profile.username} url={profile.avatarUrl} />
              <span className="sidebar-user-text">
                <span className="sidebar-user-name">{profile.displayName ?? profile.username}</span>
                <span className="sidebar-user-role">@{profile.username} · {roleLabel[profile.role]}</span>
              </span>
            </div>
          )}
          {more.map(i => (
            <NavLink key={i.to} to={i.to} onClick={() => setMoreOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <i.icon size={20} aria-hidden="true" /> {i.label}
            </NavLink>
          ))}
          <div style={{ padding: '10px 12px' }}><ThemeSwitch /></div>
          {profile && (
            <button type="button" className="nav-link nav-button btn-danger-text" onClick={() => { setMoreOpen(false); void signOut(); }}>
              <LogOut size={20} aria-hidden="true" /> Sign out
            </button>
          )}
        </MoreSheet>
      )}
    </>
  );
}

function MoreSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId} className="visually-hidden">More</h2>
        {children}
      </div>
    </div>
  );
}
