import type { Doc } from './content.ts';

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

// ---------- Phase 1: editor & reader ----------

/** Excalidraw scene as stored: elements + image files (kept opaque outside the canvas feature). */
export interface CanvasScene {
  elements: unknown[];
  files: Record<string, unknown>;
}

export interface ArticleMeta {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  visibility: ArticleVisibility;
}

export interface ArticleDraft {
  id: string;
  meta: ArticleMeta;
  status: ArticleStatus;
  templateKey: string | null;
  publishedVersion: number | null;
  ownerUsername: string;
  doc: Doc;
  canvas: CanvasScene;
  version: number;
  updatedAt: string;
}

export interface PublishedArticle {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  visibility: ArticleVisibility;
  hasBrief: boolean;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  version: number;
  views: number;
  isOwner: boolean;
  author: PublicProfile;
  doc: Doc;
  canvas: CanvasScene;
}

export type PublicArticleOrNull = PublishedArticle | null;
