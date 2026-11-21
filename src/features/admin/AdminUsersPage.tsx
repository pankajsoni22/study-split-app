import { Users } from 'lucide-react';
import { useState } from 'react';
import { roleLabel } from '../../domain/roles.ts';
import type { AdminUser, Role } from '../../domain/types.ts';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { useQuery } from '../../data/useQuery.ts';
import { formatDate } from '../../lib/text.ts';
import Avatar from '../../ui/Avatar.tsx';
import { EmptyState, ErrorState, Loading } from '../../ui/States.tsx';
import { useAuth } from '../auth/useAuth.ts';

const ROLES: Role[] = ['reader', 'writer', 'admin'];

export default function AdminUsersPage() {
  const users = useQuery('admin:users', s => s.admin.listUsers());
  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>Users</h1>
          <p className="page-subtitle">Everyone who has signed in. Change a role to let someone write or administer.</p>
        </div>
      </header>
      {users.error && <ErrorState error={users.error} onRetry={users.reload} />}
      {!users.data && users.loading && <Loading />}
      {users.data?.length === 0 && <div className="card"><EmptyState icon={Users} title="No users yet" /></div>}
      {users.data && users.data.length > 0 && (
        <section className="card">
          <ul className="row-list">{users.data.map(u => <UserRow key={u.id} user={u} />)}</ul>
        </section>
      )}
    </>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const { profile } = useAuth();
  const [role, setRole] = useState<Role>(user.role);
  const [state, setState] = useState<{ saving: boolean; error: string }>({ saving: false, error: '' });
  const isMe = profile?.id === user.id;

  async function change(next: Role) {
    const previous = role;
    setRole(next);
    setState({ saving: true, error: '' });
    try {
      await getServices().admin.setRole(user.id, next);
      setState({ saving: false, error: '' });
    } catch (err) {
      setRole(previous);
      setState({ saving: false, error: errorMessage(err) });
    }
  }

  return (
    <li className="row">
      <div className="row-who">
        <Avatar name={user.displayName ?? user.email} url={user.avatarUrl} />
        <div className="row-text">
          <span className="row-title">{user.displayName ?? user.email}{isMe && <span className="muted"> (you)</span>}</span>
          <span className="row-note">
            {user.usernameConfirmed ? `@${user.username}` : 'username not chosen yet'} · {user.email} · joined {formatDate(user.createdAt)}
          </span>
          {state.error && <span className="field-error" role="alert">{state.error}</span>}
        </div>
      </div>
      <div className="row-actions">
        <label className="visually-hidden" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
        <select id={`role-${user.id}`} value={role} disabled={state.saving || isMe} onChange={e => void change(e.target.value as Role)}
          title={isMe ? "You can't change your own role" : undefined}>
          {ROLES.map(r => <option key={r} value={r}>{roleLabel[r]}</option>)}
        </select>
      </div>
    </li>
  );
}
