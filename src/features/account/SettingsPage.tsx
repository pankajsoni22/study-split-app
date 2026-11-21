import { useCallback, useState, type FormEvent } from 'react';
import { roleDescription, roleLabel } from '../../domain/roles.ts';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import Avatar from '../../ui/Avatar.tsx';
import ThemeSwitch from '../../ui/ThemeSwitch.tsx';
import { useAuth } from '../auth/useAuth.ts';
import { UsernameField, type Availability } from './UsernameField.tsx';

const DAY = 24 * 60 * 60 * 1000;

export default function SettingsPage() {
  const { profile, session } = useAuth();
  if (!profile) return null;
  return (
    <div className="stack narrow">
      <header className="page-header">
        <div className="page-title">
          <h1>Settings</h1>
          <p className="page-subtitle">Your public profile and how Study Split looks on this device.</p>
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Avatar name={profile.displayName ?? profile.username} url={profile.avatarUrl} className="avatar-lg" />
            <div>
              <h2>{profile.displayName ?? profile.username}</h2>
              <p className="card-sub">{session?.email} · <span className="badge badge-accent">{roleLabel[profile.role]}</span></p>
              <p className="card-sub">{roleDescription[profile.role]}</p>
            </div>
          </div>
        </div>
        <ProfileForm key={profile.id} />
      </section>

      <section className="card">
        <div className="card-head"><h2>Username</h2></div>
        <UsernameForm key={profile.username} />
      </section>

      <section className="card">
        <div className="card-head">
          <div><h2>Appearance</h2><p className="card-sub">Saved in this browser.</p></div>
        </div>
        <ThemeSwitch />
      </section>
    </div>
  );
}

function ProfileForm() {
    const { profile, setProfile } = useAuth();
    const p = profile!;
    const [displayName, setDisplayName] = useState(p.displayName ?? '');
    const [bio, setBio] = useState(p.bio ?? '');
    const [state, setState] = useState<{ saving: boolean; message: string; error: boolean }>({ saving: false, message: '', error: false });
    const dirty = displayName !== (p.displayName ?? '') || bio !== (p.bio ?? '');

    async function save(e: FormEvent) {
      e.preventDefault();
      setState({ saving: true, message: '', error: false });
      try {
        setProfile(await getServices().profiles.updateMine({ displayName: displayName.trim() || null, bio: bio.trim() || null }));
        invalidate(`profile:${p.username}`);
        setState({ saving: false, message: 'Saved', error: false });
      } catch (err) {
        setState({ saving: false, message: errorMessage(err), error: true });
      }
    }

    return (
      <form onSubmit={e => void save(e)}>
        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input id="displayName" value={displayName} maxLength={80} onChange={e => setDisplayName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" value={bio} maxLength={280} onChange={e => setBio(e.target.value)} placeholder="Backend engineer, writing about system design…" />
          <span className="field-hint">{280 - bio.length} characters left</span>
        </div>
        <div className="form-row-end">
          {state.message && <span className={state.error ? 'field-error' : 'field-ok'} role="status">{state.message}</span>}
          <button className="btn" disabled={!dirty || state.saving}>{state.saving ? 'Saving…' : 'Save profile'}</button>
        </div>
      </form>
    );
}

function UsernameForm() {
    const { profile, setProfile } = useAuth();
    const p = profile!;
    const [name, setName] = useState(p.username);
    const [availability, setAvailability] = useState<Availability>('idle');
    const [state, setState] = useState<{ saving: boolean; message: string; error: boolean }>({ saving: false, message: '', error: false });
    const onAvailability = useCallback((a: Availability) => setAvailability(a), []);
    const changedAt = p.usernameChangedAt ? new Date(p.usernameChangedAt).getTime() : 0;
    // eslint-disable-next-line react-hooks/purity -- a render-time clock read is fine for this hint
    const waitDays = Math.ceil((changedAt + 30 * DAY - Date.now()) / DAY);
    const locked = waitDays > 0;

    async function save(e: FormEvent) {
      e.preventDefault();
      setState({ saving: true, message: '', error: false });
      try {
        setProfile(await getServices().profiles.claimUsername(name));
        invalidate('articles:');
      } catch (err) {
        setState({ saving: false, message: errorMessage(err), error: true });
      }
    }

    return (
      <form onSubmit={e => void save(e)}>
        <p className="card-sub" style={{ marginBottom: 14 }}>
          Your articles live at /{p.username}/…. You can change it once every 30 days.
          {locked && <> Next change possible in <b>{waitDays} day{waitDays === 1 ? '' : 's'}</b>.</>}
        </p>
        <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
          <UsernameField value={name} onChange={setName} current={p.username} onAvailability={onAvailability} />
        </fieldset>
        <div className="form-row-end">
          {state.message && <span className={state.error ? 'field-error' : 'field-ok'} role="status">{state.message}</span>}
          <button className="btn" disabled={locked || name === p.username || availability !== 'available' || state.saving}>
            {state.saving ? 'Saving…' : 'Change username'}
          </button>
        </div>
      </form>
    );
}
