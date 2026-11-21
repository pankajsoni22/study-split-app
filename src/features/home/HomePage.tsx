import { FilePen, LogIn, NotebookPen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { can } from '../../domain/roles.ts';
import { useQuery } from '../../data/useQuery.ts';
import { EmptyState, ErrorState } from '../../ui/States.tsx';
import ArticleCard from '../articles/ArticleCard.tsx';
import { useAuth } from '../auth/useAuth.ts';

export default function HomePage() {
  const { status, profile } = useAuth();
  const latest = useQuery('articles:public', s => s.articles.listPublic({ limit: 24 }));
  const tags = useQuery('tags:featured', s => s.tags.listFeatured());

  return (
    <div className="stack">
      <section className="card hero">
        <div>
          <h1>Notes that <em>explain themselves</em>.</h1>
          <p>Write on the left, sketch on the right. Study Split keeps your words and diagrams side by side, for system designs, interview experiences and projects you want to revise later.</p>
          <div className="hero-actions">
            {can.write(profile?.role)
              ? <Link className="btn btn-lg" to="/write/new"><FilePen size={18} aria-hidden="true" /> Start writing</Link>
              : status === 'signedOut'
                ? <Link className="btn btn-lg" to="/signin"><LogIn size={18} aria-hidden="true" /> Sign in with Google</Link>
                : null}
            <a className="btn btn-lg btn-ghost" href="#latest">Browse articles</a>
          </div>
        </div>
        <SplitDemo />
      </section>

      {tags.data && tags.data.length > 0 && (
        <nav aria-label="Topics" className="tag-list">
          {tags.data.map(t => <span key={t.slug} className="tag">{t.label}</span>)}
        </nav>
      )}

      <section aria-labelledby="latest">
        <div className="section-head"><h2 id="latest">Latest articles</h2></div>
        {latest.error && <ErrorState error={latest.error} onRetry={latest.reload} />}
        {!latest.data && latest.loading && (
          <div className="article-grid">{[0, 1, 2].map(i => <div key={i} className="card skeleton" style={{ height: 160 }} />)}</div>
        )}
        {latest.data?.length === 0 && (
          <div className="card">
            <EmptyState icon={NotebookPen} title="No articles yet">
              <p className="muted">The first published article will appear here.</p>
            </EmptyState>
          </div>
        )}
        {latest.data && latest.data.length > 0 && (
          <div className="article-grid">{latest.data.map(a => <ArticleCard key={a.id} article={a} />)}</div>
        )}
      </section>
    </div>
  );
}

/** Tiny illustration of the split layout: text (active line in amber) beside a sketched diagram. */
function SplitDemo() {
  return (
    <div className="split-demo" aria-hidden="true">
      <div className="split-demo-text">
        <span className="h" /><span className="active" /><span /><span style={{ width: '80%' }} /><span style={{ width: '60%' }} />
        <span className="h" style={{ marginTop: 8, width: '55%' }} /><span /><span style={{ width: '70%' }} />
      </div>
      <div className="split-demo-spine" />
      <div className="split-demo-canvas">
        <svg viewBox="0 0 200 150" fill="none" stroke="#33413f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="12" y="58" width="44" height="32" rx="6" stroke="#e9a23b" strokeWidth="2.6" fill="#fbefd9" />
          <path d="M14 60c14-1 28-1 41 0" stroke="none" />
          <rect x="82" y="20" width="50" height="30" rx="6" />
          <rect x="82" y="98" width="50" height="30" rx="6" />
          <path d="M152 52c8-1 30-1 36 0 1 14 1 30 0 44-8 1-28 1-36 0-1-14-1-30 0-44z" />
          <path d="M57 70c8-12 15-22 24-30" /><path d="M76 38l6 1-1 7" />
          <path d="M57 80c8 12 15 22 24 30" /><path d="M75 111l6-1-1-6" />
          <path d="M133 35c6 8 12 16 18 22" /><path d="M146 58l5-1 0-5" />
          <path d="M133 113c6-8 12-16 18-22" />
        </svg>
      </div>
    </div>
  );
}
