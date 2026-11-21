import { Globe, Link2, Lock, Trash2, Undo2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { slugify, tagSlug } from '../../domain/slug.ts';
import type { ArticleVisibility } from '../../domain/types.ts';
import { errorMessage } from '../../data/errors.ts';
import Dialog from '../../ui/Dialog.tsx';
import type { DraftSession } from './useDraftSession.ts';

const VISIBILITY: { value: ArticleVisibility; label: string; hint: string; Icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', hint: 'Listed on the home page and your profile.', Icon: Globe },
  { value: 'unlisted', label: 'Unlisted', hint: 'Anyone with the link can read it; not listed anywhere.', Icon: Link2 },
  { value: 'private', label: 'Private', hint: 'Only you (and admins) can read it.', Icon: Lock }
];

/** Address, summary, tags, visibility + unpublish/delete. Changes are saved with the article. */
export default function ArticleSettingsDialog({ session, username, onClose, onDeleted }: {
  session: DraftSession;
  username: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const meta = session.meta!;
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  function addTag() {
    const t = tagSlug(tagInput);
    if (t && !meta.tags.includes(t) && meta.tags.length < 10) session.setMeta({ tags: [...meta.tags, t] });
    setTagInput('');
  }
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && !tagInput && meta.tags.length) session.setMeta({ tags: meta.tags.slice(0, -1) });
  };

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label); setError('');
    try { await fn(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(''); }
  }

  return (
    <Dialog title="Article settings" onClose={onClose} wide>
      <div className="field">
        <label htmlFor="slug">Address</label>
        <div className="input-affix slug-input">
          <span className="affix affix-left">/{username}/</span>
          <input id="slug" value={meta.slug} spellCheck={false}
            onChange={e => session.setMeta({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }, { slugEdited: true })}
            onBlur={() => session.setMeta({ slug: slugify(meta.slug) }, { slugEdited: true })} />
        </div>
        <span className="field-hint">Changing the address of a published article breaks old links.</span>
      </div>

      <div className="field">
        <label htmlFor="summary">Summary</label>
        <textarea id="summary" maxLength={400} value={meta.summary} placeholder="One or two sentences shown on article cards."
          onChange={e => session.setMeta({ summary: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="tags">Tags <span className="muted">({meta.tags.length}/10)</span></label>
        <div className="tag-input">
          {meta.tags.map(t => (
            <button key={t} type="button" className="tag tag-removable" onClick={() => session.setMeta({ tags: meta.tags.filter(x => x !== t) })}
              aria-label={`Remove tag ${t}`}>{t} ×</button>
          ))}
          <input id="tags" value={tagInput} placeholder={meta.tags.length ? '' : 'system-design, interview-experience…'}
            onChange={e => setTagInput(e.target.value)} onKeyDown={onTagKey} onBlur={addTag} disabled={meta.tags.length >= 10} />
        </div>
      </div>

      <fieldset className="field fieldset-plain">
        <legend className="field-label">Who can read it</legend>
        <div className="choice-list">
          {VISIBILITY.map(({ value, label, hint, Icon }) => (
            <label key={value} className={`choice${meta.visibility === value ? ' is-on' : ''}`}>
              <input type="radio" name="visibility" value={value} checked={meta.visibility === value}
                onChange={() => session.setMeta({ visibility: value })} />
              <Icon size={18} aria-hidden="true" />
              <span><b>{label}</b><span className="muted">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="field-hint">These settings are saved together with the article (Save or Ctrl+S).</p>
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="danger-zone">
        {session.status === 'published' && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy}
            onClick={() => void act('unpublish', session.unpublish)}>
            <Undo2 size={15} aria-hidden="true" /> {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm btn-danger-text" disabled={!!busy}
          onClick={() => {
            if (window.confirm(`Delete "${meta.title}" permanently? This cannot be undone.`)) {
              void act('delete', async () => { await session.remove(); onDeleted(); });
            }
          }}>
          <Trash2 size={15} aria-hidden="true" /> {busy === 'delete' ? 'Deleting…' : 'Delete article'}
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Done</button>
      </div>
    </Dialog>
  );
}
