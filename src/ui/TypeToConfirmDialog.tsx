import { useId, useState, type FormEvent, type ReactNode } from 'react';
import Dialog from './Dialog.tsx';

/**
 * Confirmation for destructive actions: the user must type `expected` exactly (e.g. the article title) before the
 * button unlocks, so nothing is deleted by an accidental click.
 */
export default function TypeToConfirmDialog({ title, children, expected, confirmLabel, busyLabel, onConfirm, onClose }: {
  title: string;
  children: ReactNode;
  expected: string;
  confirmLabel: string;
  busyLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = typed.trim() === expected.trim() && expected.trim() !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true); setError('');
    try { await onConfirm(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); setBusy(false); }
  }

  return (
    <Dialog title={title} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={e => void submit(e)}>
        <div className="dialog-body">{children}</div>
        <div className="field">
          <label htmlFor={id}>Type <b className="confirm-expected">{expected}</b> to confirm</label>
          <input id={id} value={typed} autoComplete="off" spellCheck={false} onChange={e => setTyped(e.target.value)}
            onPaste={e => e.preventDefault()} aria-describedby={`${id}-hint`} />
          <span id={`${id}-hint`} className="field-hint">Pasting is turned off, so please type it.</span>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-danger" disabled={!matches || busy}>{busy ? busyLabel : confirmLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}
