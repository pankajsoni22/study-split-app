import { FilePen, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import { useQuery } from '../../data/useQuery.ts';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { EmptyState, ErrorState, Loading } from '../../ui/States.tsx';
import ArticleCard from './ArticleCard.tsx';

export default function MyArticlesPage() {
  const mine = useQuery('articles:mine', s => s.articles.listMine());
  const narrow = useIsNarrow();
  const location = useLocation();
  const navigate = useNavigate();
  const trashed = (location.state as { trashed?: { id: string; title: string } } | null)?.trashed ?? null;
  const [undo, setUndo] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const clearNotice = () => void navigate('.', { replace: true, state: null });

  async function undoTrash() {
    if (!trashed) return;
    setUndo({ busy: true, error: '' });
    try {
      await getServices().articles.restore(trashed.id);
      invalidate('articles:'); invalidate('trash'); mine.reload();
      clearNotice();
      setUndo({ busy: false, error: '' });
    } catch (err) { setUndo({ busy: false, error: errorMessage(err) }); }
  }
  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>My articles</h1>
          <p className="page-subtitle">Drafts, published and archived — only you (and admins) see this list.</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-ghost" to="/me/trash"><Trash2 size={16} aria-hidden="true" /> Trash</Link>
          {!narrow && <Link className="btn" to="/write/new"><FilePen size={17} aria-hidden="true" /> New article</Link>}
        </div>
      </header>
      {trashed && (
        <div className="banner" role="status">
          <span style={{ flex: 1 }}>“{trashed.title}” was moved to Trash.{undo.error && <span className="field-error"> {undo.error}</span>}</span>
          <button type="button" className="btn btn-sm" disabled={undo.busy} onClick={() => void undoTrash()}>{undo.busy ? 'Restoring…' : 'Undo'}</button>
          <Link className="btn btn-sm btn-ghost" to="/me/trash">Open Trash</Link>
        </div>
      )}
      {mine.error && <ErrorState error={mine.error} onRetry={mine.reload} />}
      {!mine.data && mine.loading && <Loading />}
      {mine.data?.length === 0 && (
        <div className="card">
          <EmptyState icon={FileText} title="Nothing here yet">
            <p className="muted">Your drafts and published articles will be listed here.</p>
          </EmptyState>
        </div>
      )}
      {mine.data && mine.data.length > 0 && (
        <div className="article-grid">{mine.data.map(a => <ArticleCard key={a.id} article={a} showStatus />)}</div>
      )}
    </>
  );
}
