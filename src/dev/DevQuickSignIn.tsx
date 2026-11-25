import { useState } from 'react';
import { errorMessage } from '../data/errors.ts';
import { getServices } from '../data/services.ts';
import { invalidate } from '../data/useQuery.ts';

/**
 * LOCAL DEVELOPMENT ONLY — sign in as a seeded test user (supabase/seed.sql, scripts/build-seed.mjs).
 * Rendered only when `devQuickSignIn` is true (dev server + local database), so it never ships to production.
 */
const TEST_PASSWORD = 'study-split-dev';
const TEST_USERS = [
  { email: 'admin@study-split.local', label: 'Admin', hint: 'dev-admin · can manage users' },
  { email: 'writer@study-split.local', label: 'Writer', hint: 'dev-writer · owns the sample articles' },
  { email: 'reader@study-split.local', label: 'Reader', hint: 'dev-reader · read only' }
];

export default function DevQuickSignIn() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function signIn(email: string) {
    setBusy(email); setError('');
    try {
      await getServices().auth.signInWithPassword(email, TEST_PASSWORD);
      invalidate('');
    } catch (err) {
      setError(`${errorMessage(err)} — is the local database running? (npm run db:status)`);
    } finally { setBusy(''); }
  }
  return (
    <section className="dev-signin" aria-label="Local test users">
      <p className="dev-signin-title">Local development · sign in as a test user</p>
      <div className="dev-signin-buttons">
        {TEST_USERS.map(u => (
          <button key={u.email} type="button" className="btn btn-ghost btn-sm" disabled={!!busy} title={u.hint} onClick={() => void signIn(u.email)}>
            {busy === u.email ? 'Signing in…' : u.label}
          </button>
        ))}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  );
}
