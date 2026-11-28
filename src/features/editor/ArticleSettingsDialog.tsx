import { Globe, Link2, Lock, Trash2, Undo2 } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { layoutById, type LayoutId } from '../../domain/layouts.ts';
import { slugify, tagSlug } from '../../domain/slug.ts';
import type { ArticleVisibility } from '../../domain/types.ts';
import { errorMessage } from '../../data/errors.ts';
import Dialog from '../../ui/Dialog.tsx';
import TypeToConfirmDialog from '../../ui/TypeToConfirmDialog.tsx';
import LayoutPicker from '../../ui/LayoutPicker.tsx';
import type { DraftSession } from './useDraftSession.ts';

const VISIBILITY: { value: ArticleVisibility; label: string; hint: string; Icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', hint: 'Listed on the home page and your profile.', Icon: Globe },
  { value: 'unlisted', label: 'Unlisted', hint: 'Anyone with the link can read it; not listed anywhere.', Icon: Link2 },
  { value: 'private', label: 'Private', hint: 'Only you (and admins) can read it.', Icon: Lock }
];

/** Address, summary, tags, visibility + unpublish/delete. Changes are saved with the article. */
export default function ArticleSettingsDialog({ session, articleLayout, onArticleLayout, onClose, onTrashed }: {
  session: DraftSession;
  articleLayout: LayoutId;
  onArticleLayout: (id: LayoutId) => void;
  onClose: () => void;
  /** Called after the article was moved to the Trash. */
  onTrashed: (title: string) => void;
}) {
  const meta = session.meta!;
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function addTag() {
    const t = tagSlug(tagInput);
    if (t && !meta.tags.includes(t) && meta.tags.length < 10) session.setMeta({ tags: [...meta.tags, t] });
    setTagInput('');
  }
  const publicId = session.draft?.publicId ?? '';
  const readBase = `${window.location.origin}${import.meta.env.BASE_URL}read/`;
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { window.prompt('Copy this link', text); }
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    if (e.key === 'Backspace' && !tagInput && meta.tags.length) session.setMeta({ tags: meta.tags.slice(0, -1) });
  };

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label); setError('');
    try { await fn(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(''); }
  }

  if (confirmDelete) {
    const title = meta.title.trim() || 'Untitled';
    return (
      <TypeToConfirmDialog title="Move article to Trash?" expected={title} confirmLabel="Move to Trash" busyLabel="Moving…"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { await session.moveToTrash(); onTrashed(title); }}>
        <p>Readers will no longer see <b>{title}</b>. You can restore it from <b>Trash</b> at any time.</p>
      </TypeToConfirmDialog>
    );
  }

  return (
    <Dialog title="Article settings" onClose={onClose} wide>
      {/* Links (2026-11-28): the permanent id link, and an optional readable slug link. */}
      <div className="field">
        <span className="field-label">Link</span>
        <div className="article-link-row">
          <code className="article-link">{readBase}{publicId}</code>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(`${readBase}${publicId}`)}>
            <Link2 size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span className="field-hint">Permanent: it never changes, whatever you rename.</span>
      </div>

      <div className="field">
        <label htmlFor="slug">Slug <span className="muted">(optional)</span></label>
        <div className="input-affix slug-input">
          <span className="affix affix-left">/read/</span>
          <input id="slug" value={meta.slug} spellCheck={false} placeholder="e.g. consistent-hashing"
            onChange={e => session.setMeta({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
            onBlur={() => { const clean = meta.slug.trim() ? slugify(meta.slug) : ''; if (clean !== meta.slug) session.setMeta({ slug: clean }); }} />
        </div>
        <span className="field-hint">
          A readable second link: readers can also open the article at /read/<b>{meta.slug || 'your-slug'}</b>. Unique across
          Study Split; lowercase letters, numbers and hyphens; leave empty for none. Changing it breaks the old slug link
          (the link above always works).
        </span>
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

      <div className="field">
        <span className="field-label">Layout &amp; slide shape</span>
        <div className="layout-setting">
          <LayoutPicker value={articleLayout} onChange={onArticleLayout} label="Article layout (text : drawing)" />
          <span className="field-hint">
            {layoutById(articleLayout).label}: slides are {layoutById(articleLayout).slide.width}×{layoutById(articleLayout).slide.height}.
            Readers start with this layout. Your editor layout (top bar, Auto) is separate.
          </span>
        </div>
      </div>

      <p className="field-hint">These settings are saved together with the article (Save or Ctrl+S).</p>
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="danger-zone">
        {session.status === 'published' && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy}
            onClick={() => void act('unpublish', session.unpublish)}>
            <Undo2 size={15} aria-hidden="true" /> {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm btn-danger-text" disabled={!!busy} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={15} aria-hidden="true" /> Delete article
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={onClose}>Done</button>
      </div>
    </Dialog>
  );
}
