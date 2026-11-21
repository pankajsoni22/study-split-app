// Pure domain types. No vendor (Supabase) shapes leak past src/data/adapters.

export type Role = 'reader' | 'writer' | 'admin';
export type ArticleStatus = 'draft' | 'published' | 'archived';
export type ArticleVisibility = 'public' | 'unlisted' | 'private';

export interface Profile {
  id: string;
  username: string;
  usernameConfirmed: boolean;
  usernameChangedAt: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: Role;
  createdAt: string;
}

export interface PublicProfile {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  status: ArticleStatus;
  visibility: ArticleVisibility;
  readingMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
  views: number;
  author: PublicProfile;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  usernameConfirmed: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface AppSettings {
  defaultRole: Extract<Role, 'reader' | 'writer'>;
}

export interface Tag {
  slug: string;
  label: string;
  featured: boolean;
}
