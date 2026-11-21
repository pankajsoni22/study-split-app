import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { can } from '../../domain/roles.ts';
import { useAuth } from './useAuth.ts';

/** Gate for signed-in pages. `need` adds a role check (the database enforces it too). */
export default function RequireAuth({ need, children }: { need?: 'write' | 'admin'; children: ReactNode }) {
  const { status, profile } = useAuth();
  const location = useLocation();

  if (status === 'loading' || status === 'signingIn' || (status === 'signedIn' && !profile)) {
    return <div className="state"><div className="spinner" aria-label="Loading" /></div>;
  }
  if (status === 'signedOut') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/signin?next=${next}`} replace />;
  }
  if (need && !can[need](profile?.role)) {
    return (
      <div className="state">
        <span className="state-icon"><Lock size={24} aria-hidden="true" /></span>
        <p className="state-title">{need === 'admin' ? 'Admins only' : 'Writer access needed'}</p>
        <p className="muted">
          {need === 'admin'
            ? 'This page is only for administrators.'
            : 'Your account can read articles. Ask an admin to make you a writer to start publishing.'}
        </p>
        <Link className="btn btn-ghost" to="/">Back to home</Link>
      </div>
    );
  }
  return <>{children}</>;
}
