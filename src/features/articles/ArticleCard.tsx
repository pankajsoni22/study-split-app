import { Clock, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ArticleSummary } from '../../domain/types.ts';
import { formatCount, formatDate } from '../../lib/text.ts';
import Avatar from '../../ui/Avatar.tsx';

const STATUS_BADGE: Record<string, string> = { draft: 'badge-pending', published: 'badge-good', archived: 'badge-neutral' };

/** Card for lists. `showStatus` is for the owner's own list (drafts, private…). */
export default function ArticleCard({ article, showStatus = false }: { article: ArticleSummary; showStatus?: boolean }) {
  const a = article;
  const to = showStatus ? `/write/${a.publicId}` : `/read/${a.publicId}`;
  return (
    <Link to={to} className="card article-card">
      {showStatus && (
        <span className="tag-list">
          <span className={`badge ${STATUS_BADGE[a.status] ?? 'badge-neutral'}`}>{a.status}</span>
          {a.visibility !== 'public' && <span className="badge badge-neutral">{a.visibility}</span>}
        </span>
      )}
      <h3>{a.title}</h3>
      {a.summary && <p>{a.summary}</p>}
      {a.tags.length > 0 && <span className="tag-list">{a.tags.slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}</span>}
      <span className="article-meta">
        {!showStatus && (
          <span className="author-chip"><Avatar name={a.author.displayName ?? a.author.username} url={a.author.avatarUrl} />@{a.author.username}</span>
        )}
        <span>{formatDate(a.publishedAt ?? a.updatedAt)}</span>
        {a.readingMinutes > 0 && <span><Clock size={13} aria-hidden="true" />{a.readingMinutes} min</span>}
        {a.status === 'published' && <span><Eye size={13} aria-hidden="true" />{formatCount(a.views)}<span className="visually-hidden"> views</span></span>}
      </span>
    </Link>
  );
}
