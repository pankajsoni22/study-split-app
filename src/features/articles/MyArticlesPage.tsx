import { FilePen, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '../../data/useQuery.ts';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { EmptyState, ErrorState, Loading } from '../../ui/States.tsx';
import ArticleCard from './ArticleCard.tsx';

export default function MyArticlesPage() {
  const mine = useQuery('articles:mine', s => s.articles.listMine());
  const narrow = useIsNarrow();
  return (
    <>
      <header className="page-header">
        <div className="page-title">
          <h1>My articles</h1>
          <p className="page-subtitle">Drafts, published and archived — only you (and admins) see this list.</p>
        </div>
        {!narrow && <div className="page-actions"><Link className="btn" to="/write/new"><FilePen size={17} aria-hidden="true" /> New article</Link></div>}
      </header>
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
