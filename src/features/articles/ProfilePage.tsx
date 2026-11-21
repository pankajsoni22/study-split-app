import { NotebookPen } from 'lucide-react';
import { useParams } from 'react-router-dom';
import NotFoundPage from '../../app/NotFoundPage.tsx';
import { useQuery } from '../../data/useQuery.ts';
import Avatar from '../../ui/Avatar.tsx';
import { EmptyState, ErrorState, Loading } from '../../ui/States.tsx';
import ArticleCard from './ArticleCard.tsx';

/** /:username — a writer's public page (like a GitHub profile). Two small queries in parallel. */
export default function ProfilePage() {
  const username = (useParams().username ?? '').toLowerCase();
  const person = useQuery(`profile:${username}`, s => s.profiles.getByUsername(username));
  const articles = useQuery(`articles:by:${username}`, s => s.articles.listPublishedBy(username));

  if (person.error) return <ErrorState error={person.error} onRetry={person.reload} />;
  if (person.data === undefined) return <Loading />;
  if (person.data === null) return <NotFoundPage />;
  const p = person.data;

  return (
    <div className="stack">
      <header className="card" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Avatar name={p.displayName ?? p.username} url={p.avatarUrl} className="avatar-lg" />
        <div className="page-title">
          <h1>{p.displayName ?? p.username}</h1>
          <span className="muted">@{p.username}</span>
          {p.bio && <p>{p.bio}</p>}
        </div>
      </header>
      {articles.error && <ErrorState error={articles.error} onRetry={articles.reload} />}
      {articles.data?.length === 0 && (
        <div className="card"><EmptyState icon={NotebookPen} title="No published articles yet" /></div>
      )}
      {articles.data && articles.data.length > 0 && (
        <div className="article-grid">{articles.data.map(a => <ArticleCard key={a.id} article={a} />)}</div>
      )}
    </div>
  );
}
