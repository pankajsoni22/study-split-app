import { useCallback, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import Brand from '../../ui/Brand.tsx';
import { UsernameField, type Availability } from '../account/UsernameField.tsx';
import { useAuth } from './useAuth.ts';

/** First sign-in: accept the suggested username or pick another (idea #10). */
export default function UsernameOnboardingPage() {
  const { profile, setProfile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState(profile?.username ?? '');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const onAvailability = useCallback((a: Availability) => setAvailability(a), []);

  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (profile?.usernameConfirmed) return <Navigate to={target} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      setProfile(await getServices().profiles.claimUsername(name));
      void navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const base = `${window.location.host}${import.meta.env.BASE_URL}`;
  return (
    <main id="main" className="onboard">
      <form className="card" onSubmit={e => void submit(e)}>
        <div className="onboard-head">
          <Brand to={null} subtitle={null} />
          <h1>Choose your username</h1>
          <p className="muted">Everything you publish lives under it, like a GitHub profile. We suggested one, so keep it or change it.</p>
        </div>
        <UsernameField value={name} onChange={setName} current={profile?.username} onAvailability={onAvailability} />
        <p className="url-preview">Your page: <b>{base}{name || 'username'}</b></p>
        {error && <p className="error-text" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <button className="btn btn-lg" style={{ width: '100%', marginTop: 20 }} disabled={saving || availability !== 'available'}>
          {saving ? 'Saving…' : name === profile?.username ? 'Accept username' : 'Use this username'}
        </button>
      </form>
    </main>
  );
}
