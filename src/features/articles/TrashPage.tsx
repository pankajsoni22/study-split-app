import { ArchiveRestore, ArrowLeft, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArticleSummary } from '../../domain/types.ts';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate, useQuery } from '../../data/useQuery.ts';
import { formatDate } from '../../lib/text.ts';
import { EmptyState, ErrorState, Loading } from '../../ui/States.tsx';
import TypeToConfirmDialog from '../../ui/TypeToConfirmDialog.tsx';

/** /me/trash: restore articles, or delete them forever (hidden for good; kept in the database for admins). */
export default function TrashPage() {
  const trash = useQuery('trash', s => s.articles.listTrash());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [purging, setPurging] = useState<ArticleSummary | null>(null);

  async function restore(a: ArticleSummary) {
    setBusy(a.id); setError(''); setNotice('');
    try {
      await getServices().articles.restore(a.id);
      invalidate('articles:'); trash.reload();
      setNotice(`"${a.title}" was restored${a.status === 'published' ? ' and is visible to readers again' : ''}.`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(null); }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>Trash</h1>
          <p className="page-subtitle">Deleted articles stay here until you restore them or delete them forever. Readers can't see them.</p>
        </div>
        <div className="page-actions"><Link className="btn btn-ghost" to="/me/articles"><ArrowLeft size={16} aria-hidden="true" /> My articles</Link></div>
      </header>
      {error && <p className="banner banner-error" role="alert">{error}</p>}
      {notice && <p className="banner banner-good" role="status">{notice}</p>}
      {trash.error && <ErrorState error={trash.error} onRetry={trash.reload} />}
      {!trash.data && trash.loading && <Loading />}
      {trash.data?.length === 0 && (
        <div className="card"><EmptyState icon={Trash2} title="Trash is empty"><p className="muted">Articles you delete appear here.</p></EmptyState></div>
      )}
      {trash.data && trash.data.length > 0 && (
        <section className="card">
          <ul className="row-list">
            {trash.data.map(a => (
              <li key={a.id} className="row">
                <div className="row-text">
                  <span className="row-title">{a.title}</span>
                  <span className="row-note">
                    Deleted {formatDate(a.deletedAt)} · was {a.status}{a.status === 'published' ? ` (${a.visibility})` : ''}
                  </span>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn btn-sm" disabled={busy === a.id} onClick={() => void restore(a)}>
                    <ArchiveRestore size={15} aria-hidden="true" /> {busy === a.id ? 'Restoring…' : 'Restore'}
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost btn-danger-text" disabled={busy === a.id} onClick={() => setPurging(a)}>
                    <Trash2 size={15} aria-hidden="true" /> Delete forever
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {purging && (
        <TypeToConfirmDialog title="Delete forever?" expected={purging.title.trim() || 'Untitled'} confirmLabel="Delete forever" busyLabel="Deleting…"
          onClose={() => setPurging(null)}
          onConfirm={async () => {
            await getServices().articles.purge(purging.id);
            setNotice(`"${purging.title}" was deleted forever.`);
            setPurging(null);
            invalidate('articles:'); trash.reload();
          }}>
          <p><b>{purging.title}</b> will be removed from your Trash. <b>You won't be able to restore it.</b></p>
        </TypeToConfirmDialog>
      )}
    </>
  );
}
