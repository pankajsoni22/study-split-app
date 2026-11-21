import { useState } from 'react';
import { roleDescription, roleLabel } from '../../domain/roles.ts';
import type { AppSettings } from '../../domain/types.ts';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { useQuery } from '../../data/useQuery.ts';
import { ErrorState, Loading } from '../../ui/States.tsx';

const OPTIONS: AppSettings['defaultRole'][] = ['reader', 'writer'];

/** FR-25: the role new sign-ups get. Starts as Reader. */
export default function AdminSettingsPage() {
  const settings = useQuery('admin:settings', s => s.admin.getSettings());
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [state, setState] = useState<{ saving: boolean; error: string }>({ saving: false, error: '' });
  const current = saved ?? settings.data;

  async function change(role: AppSettings['defaultRole']) {
    setState({ saving: true, error: '' });
    try {
      setSaved(await getServices().admin.setDefaultRole(role));
      setState({ saving: false, error: '' });
    } catch (err) {
      setState({ saving: false, error: errorMessage(err) });
    }
  }

  return (
    <div className="stack narrow">
      <header className="page-header">
        <div className="page-title">
          <h1>App settings</h1>
          <p className="page-subtitle">Settings that apply to everyone.</p>
        </div>
      </header>
      {settings.error && <ErrorState error={settings.error} onRetry={settings.reload} />}
      {!current && settings.loading && <Loading />}
      {current && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Default role for new users</h2>
              <p className="card-sub">Applies to people who sign in for the first time from now on. Existing users keep their role.</p>
            </div>
          </div>
          <div className="segmented" role="radiogroup" aria-label="Default role for new users">
            {OPTIONS.map(r => (
              <button key={r} type="button" role="radio" aria-checked={current.defaultRole === r} disabled={state.saving}
                onClick={() => { if (current.defaultRole !== r) void change(r); }}>
                {roleLabel[r]}
              </button>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 10 }}>{roleDescription[current.defaultRole]}.</p>
          {state.error && <p className="field-error" role="alert">{state.error}</p>}
        </section>
      )}
    </div>
  );
}
