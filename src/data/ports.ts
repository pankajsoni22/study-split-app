// Backend-agnostic interfaces (docs §11.4). Components and hooks depend on these only.
// Migrating to AWS/GCP = writing another implementation of `Services`.
import type { AdminUser, AppSettings, ArticleSummary, Profile, PublicProfile, Role, Tag } from '../domain/types.ts';

export interface AuthSession {
  userId: string;
  email: string | null;
}

export interface AuthService {
  /** Calls back with the current session at once, then on every sign-in / sign-out. Returns unsubscribe. */
  onChange(listener: (session: AuthSession | null) => void): () => void;
  /** Exchanges a Google ID token (from Google Identity Services) for an app session. */
  signInWithGoogleIdToken(idToken: string, rawNonce: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface ProfileRepo {
  getMine(): Promise<Profile | null>;
  getByUsername(username: string): Promise<PublicProfile | null>;
  isUsernameAvailable(username: string): Promise<boolean>;
  claimUsername(username: string): Promise<Profile>;
  updateMine(patch: { displayName?: string | null; bio?: string | null }): Promise<Profile>;
}

export interface ArticleRepo {
  /** Public, published articles, newest first. `before` = publishedAt of the last item (keyset paging). */
  listPublic(opts?: { limit?: number; before?: string; tag?: string }): Promise<ArticleSummary[]>;
  listPublishedBy(username: string): Promise<ArticleSummary[]>;
  /** Every article the signed-in user owns, any state. */
  listMine(): Promise<ArticleSummary[]>;
  /** Fire-and-forget view counter; returns the new total. */
  recordView(articleId: string): Promise<number>;
}

export interface TagRepo {
  listFeatured(): Promise<Tag[]>;
}

export interface AdminRepo {
  listUsers(): Promise<AdminUser[]>;
  setRole(userId: string, role: Role): Promise<void>;
  getSettings(): Promise<AppSettings>;
  setDefaultRole(role: AppSettings['defaultRole']): Promise<AppSettings>;
}

export interface Services {
  auth: AuthService;
  profiles: ProfileRepo;
  articles: ArticleRepo;
  tags: TagRepo;
  admin: AdminRepo;
}
