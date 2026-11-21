import { Check, LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { normalizeUsernameInput, usernameProblem, usernameProblemText } from '../../domain/username.ts';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';

export type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

/**
 * Username input with live format check and a debounced availability check (one RPC per pause in
 * typing, docs §11.3). `current` is the user's own name — always "available" to them.
 */
export function UsernameField({ value, onChange, current, onAvailability }: {
  value: string;
  onChange: (v: string) => void;
  current?: string;
  onAvailability: (a: Availability) => void;
}) {
  const id = useId();
  const [state, setState] = useState<{ value: string; availability: Availability; message?: string }>({ value: '', availability: 'idle' });
  const problem = usernameProblem(value);

  useEffect(() => {
    if (problem || value === current) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      getServices().profiles.isUsernameAvailable(value).then(
        ok => { if (!cancelled) setState({ value, availability: ok ? 'available' : 'taken' }); },
        (err: unknown) => { if (!cancelled) setState({ value, availability: 'error', message: errorMessage(err) }); }
      );
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [value, problem, current]);

  const availability: Availability = problem ? 'invalid'
    : value === current ? 'available'
    : state.value === value ? state.availability : 'checking';

  useEffect(() => { onAvailability(availability); }, [availability, onAvailability]);

  const message = problem ? usernameProblemText[problem]
    : availability === 'taken' ? 'That username is taken or reserved.'
    : availability === 'error' ? state.message
    : availability === 'available' ? (value === current ? 'This is your current username.' : 'Available!')
    : 'Checking…';

  return (
    <div className={`field${availability === 'invalid' || availability === 'taken' ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>Username</label>
      <div className="input-affix">
        <span className="affix affix-left">@</span>
        <input id={id} value={value} autoComplete="username" spellCheck={false} autoCapitalize="none"
          aria-describedby={`${id}-msg`} maxLength={30}
          onChange={e => onChange(normalizeUsernameInput(e.target.value))} />
        <span className="affix affix-right" aria-hidden="true">
          {availability === 'checking' && <LoaderCircle size={18} className="spin-icon" />}
          {availability === 'available' && <Check size={18} color="var(--good)" />}
          {(availability === 'taken' || availability === 'invalid') && <X size={18} color="var(--danger)" />}
        </span>
      </div>
      <span id={`${id}-msg`} aria-live="polite"
        className={availability === 'available' ? 'field-ok' : availability === 'checking' ? 'field-hint' : 'field-error'}>
        {message}
      </span>
    </div>
  );
}
