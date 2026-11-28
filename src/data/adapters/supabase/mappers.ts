import type { AdminUser, ArticleSummary, Profile, PublicProfile } from '../../../domain/types.ts';

// Row shapes as PostgREST returns them (snake_case). Kept private to the adapter.
export interface ProfileRow {
  id: string;
  username: string;
  username_confirmed: boolean;
  username_changed_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: Profile['role'];
  created_at: string;
}

interface PublicProfileRow { username: string; display_name: string | null; avatar_url: string | null; bio: string | null }

export interface ArticleSummaryRow {
  id: string;
  public_id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  tags: string[];
  status: ArticleSummary['status'];
  visibility: ArticleSummary['visibility'];
  reading_minutes: number;
  published_at: string | null;
  updated_at: string;
  deleted_at: string | null;
  owner: PublicProfileRow | PublicProfileRow[] | null;
  stats: { views: number } | { views: number }[] | null;
}

export interface AdminUserRow {
  id: string; email: string; username: string; display_name: string | null; avatar_url: string | null;
  role: AdminUser['role']; username_confirmed: boolean; created_at: string; last_sign_in_at: string | null;
}

/** Columns for article cards. Never selects the heavy JSON bodies (docs §12). */
export const ARTICLE_SUMMARY_COLUMNS =
  'id, public_id, slug, title, summary, tags, status, visibility, reading_minutes, published_at, updated_at, deleted_at,' +
  ' owner:profiles!inner(username, display_name, avatar_url, bio), stats:article_stats(views)';

const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  usernameConfirmed: r.username_confirmed,
  usernameChangedAt: r.username_changed_at,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  bio: r.bio,
  role: r.role,
  createdAt: r.created_at
});

export const toPublicProfile = (r: PublicProfileRow): PublicProfile => ({
  username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url, bio: r.bio
});

export function toArticleSummary(r: ArticleSummaryRow): ArticleSummary {
  const owner = one(r.owner);
  return {
    id: r.id,
    publicId: r.public_id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    tags: r.tags,
    status: r.status,
    visibility: r.visibility,
    readingMinutes: r.reading_minutes,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
    views: one(r.stats)?.views ?? 0,
    deletedAt: r.deleted_at,
    author: owner ? toPublicProfile(owner) : { username: 'unknown', displayName: null, avatarUrl: null, bio: null }
  };
}

export const toAdminUser = (r: AdminUserRow): AdminUser => ({
  id: r.id,
  email: r.email,
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  role: r.role,
  usernameConfirmed: r.username_confirmed,
  createdAt: r.created_at,
  lastSignInAt: r.last_sign_in_at
});
