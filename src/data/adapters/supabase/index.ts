import type { SupabaseClient } from '@supabase/supabase-js';
import type { Doc } from '../../../domain/content.ts';
import type { AppSettings, ArticleDraft, CanvasScene, PublishedArticle, Role, Tag } from '../../../domain/types.ts';
import { AppError } from '../../errors.ts';
import type { AuthSession, Services } from '../../ports.ts';
import { createSupabase } from './client.ts';
import { toAppError, unwrap } from './errors.ts';
import {
  ARTICLE_SUMMARY_COLUMNS, toAdminUser, toArticleSummary, toProfile, toPublicProfile,
  type AdminUserRow, type ArticleSummaryRow, type ProfileRow
} from './mappers.ts';

interface DraftRow {
  id: string; public_id: string; title: string; slug: string | null; summary: string | null; tags: string[]; deleted_at: string | null;
  visibility: ArticleDraft['meta']['visibility']; status: ArticleDraft['status'];
  template_key: string | null; published_version: number | null; published_draft_version: number | null;
  owner: { username: string } | { username: string }[] | null;
  draft: { doc: Doc; canvas: CanvasScene; version: number; updated_at: string } | { doc: Doc; canvas: CanvasScene; version: number; updated_at: string }[] | null;
}

/** Supabase implementation of every port. The only module that knows Supabase exists. */
export function createSupabaseServices(url: string, anonKey: string): Services {
  const sb: SupabaseClient = createSupabase(url, anonKey);

  /** Current user id from the locally stored session (no network call). */
  async function myId(): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new AppError('NOT_SIGNED_IN', 'Please sign in first');
    return id;
  }

  return {
    auth: {
      onChange(listener) {
        const { data } = sb.auth.onAuthStateChange((_event, session) => {
          const s: AuthSession | null = session ? { userId: session.user.id, email: session.user.email ?? null } : null;
          // Supabase advises not to await other client calls inside this callback; defer to the next tick.
          setTimeout(() => listener(s), 0);
        });
        return () => data.subscription.unsubscribe();
      },
      async signInWithGoogleIdToken(idToken, rawNonce) {
        const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
        if (error) throw toAppError(error);
      },
      async signInWithPassword(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw toAppError(error);
      },
      async signOut() {
        const { error } = await sb.auth.signOut();
        if (error) throw toAppError(error);
      }
    },

    profiles: {
      async getMine() {
        const id = await myId();
        const row = unwrap(await sb.from('profiles').select('*').eq('id', id).maybeSingle<ProfileRow>());
        return row ? toProfile(row) : null;
      },
      async getByUsername(username) {
        const row = unwrap(await sb.from('profiles')
          .select('username, display_name, avatar_url, bio')
          .eq('username', username.toLowerCase()).eq('username_confirmed', true)
          .maybeSingle<{ username: string; display_name: string | null; avatar_url: string | null; bio: string | null }>());
        return row ? toPublicProfile(row) : null;
      },
      async isUsernameAvailable(username) {
        return unwrap(await sb.rpc('is_username_available', { p_username: username })) === true;
      },
      async claimUsername(username) {
        return toProfile(unwrap(await sb.rpc('claim_username', { p_username: username }).single<ProfileRow>()));
      },
      async updateMine(patch) {
        const id = await myId();
        const update: Record<string, string | null> = {};
        if (patch.displayName !== undefined) update.display_name = patch.displayName;
        if (patch.bio !== undefined) update.bio = patch.bio;
        return toProfile(unwrap(await sb.from('profiles').update(update).eq('id', id).select('*').single<ProfileRow>()));
      }
    },

    articles: {
      async listPublic({ limit = 20, before, tag } = {}) {
        let q = sb.from('articles').select(ARTICLE_SUMMARY_COLUMNS)
          .eq('status', 'published').eq('visibility', 'public').is('deleted_at', null)
          .order('published_at', { ascending: false }).limit(limit);
        if (before) q = q.lt('published_at', before);
        if (tag) q = q.contains('tags', [tag]);
        return unwrap(await q.returns<ArticleSummaryRow[]>()).map(toArticleSummary);
      },
      async listPublishedBy(username) {
        const rows = unwrap(await sb.from('articles').select(ARTICLE_SUMMARY_COLUMNS)
          .eq('status', 'published').eq('visibility', 'public').is('deleted_at', null).eq('owner.username', username.toLowerCase())
          .order('published_at', { ascending: false }).limit(50).returns<ArticleSummaryRow[]>());
        return rows.map(toArticleSummary);
      },
      async listMine() {
        const id = await myId();
        const rows = unwrap(await sb.from('articles').select(ARTICLE_SUMMARY_COLUMNS)
          .eq('owner_id', id).is('deleted_at', null).is('purged_at', null).order('updated_at', { ascending: false }).returns<ArticleSummaryRow[]>());
        return rows.map(toArticleSummary);
      },
      async recordView(articleId) {
        return Number(unwrap(await sb.rpc('record_view', { target: articleId })));
      },

      async create({ title, templateKey, doc }) {
        const id = unwrap(await sb.rpc('create_article', { p_title: title, p_template_key: templateKey, p_doc: doc })) as string;
        const row = unwrap(await sb.from('articles').select('public_id').eq('id', id).single<{ public_id: string }>());
        return row.public_id;
      },
      async resolveId(publicId) {
        const row = unwrap(await sb.from('articles').select('id').eq('public_id', publicId).is('purged_at', null).maybeSingle<{ id: string }>());
        return row?.id ?? null;
      },
      async getDraft(articleId) {
        // One query: metadata + owner + draft body (docs §11.3 "Open editor: 1 call").
        const row = unwrap(await sb.from('articles')
          .select('id, public_id, title, slug, summary, tags, visibility, status, template_key, published_version, published_draft_version, deleted_at,' +
            ' owner:profiles!inner(username), draft:article_drafts(doc, canvas, version, updated_at)')
          .eq('id', articleId).is('purged_at', null).maybeSingle<DraftRow>());   // deleted forever = gone (even for admins)
        if (!row) return null;
        const draft = Array.isArray(row.draft) ? row.draft[0] : row.draft;
        const owner = Array.isArray(row.owner) ? row.owner[0] : row.owner;
        if (!draft) return null;
        const result: ArticleDraft = {
          id: row.id,
          publicId: row.public_id,
          meta: { title: row.title, slug: row.slug ?? '', summary: row.summary ?? '', tags: row.tags, visibility: row.visibility },
          status: row.status,
          templateKey: row.template_key,
          publishedVersion: row.published_version,
          publishedDraftVersion: row.published_draft_version,
          ownerUsername: owner?.username ?? '',
          doc: draft.doc,
          canvas: draft.canvas,
          version: draft.version,
          updatedAt: draft.updated_at,
          deletedAt: row.deleted_at
        };
        return result;
      },
      async saveDraft(articleId, expectedVersion, { doc, canvas, meta, readingMinutes }) {
        return unwrap(await sb.rpc('save_draft', {
          p_article_id: articleId, p_expected_version: expectedVersion, p_doc: doc, p_canvas: canvas,
          p_meta: { ...meta, readingMinutes }
        })) as number;
      },
      async publish(articleId) {
        return unwrap(await sb.rpc('publish_article', { p_article_id: articleId })) as number;
      },
      async unpublish(articleId) {
        unwrap(await sb.rpc('unpublish_article', { p_article_id: articleId }));
      },
      async trash(articleId) {
        unwrap(await sb.rpc('trash_article', { p_article_id: articleId }));
      },
      async restore(articleId) {
        unwrap(await sb.rpc('restore_article', { p_article_id: articleId }));
      },
      async purge(articleId) {
        unwrap(await sb.rpc('purge_article', { p_article_id: articleId }));
      },
      async listTrash() {
        const id = await myId();
        const rows = unwrap(await sb.from('articles').select(ARTICLE_SUMMARY_COLUMNS)
          // purged_at must be excluded explicitly: admins can read deleted-forever rows (RLS), owners can't.
          .eq('owner_id', id).not('deleted_at', 'is', null).is('purged_at', null)
          .order('deleted_at', { ascending: false }).returns<ArticleSummaryRow[]>());
        return rows.map(toArticleSummary);
      },
      async getPublished(key) {
        const data = unwrap(await sb.rpc('get_published_article', { p_key: key })) as PublishedArticle | null;
        return data ?? null;
      }
    },

    tags: {
      async listFeatured() {
        const rows = unwrap(await sb.from('tags').select('slug, label, featured').eq('featured', true).order('label')
          .returns<Tag[]>());
        return rows;
      }
    },

    admin: {
      async listUsers() {
        return (unwrap(await sb.rpc('admin_list_users')) as AdminUserRow[]).map(toAdminUser);
      },
      async setRole(userId: string, role: Role) {
        unwrap(await sb.rpc('admin_set_role', { target: userId, new_role: role }));
      },
      async getSettings() {
        const row = unwrap(await sb.from('app_settings').select('default_role').single<{ default_role: AppSettings['defaultRole'] }>());
        return { defaultRole: row.default_role };
      },
      async setDefaultRole(role) {
        const row = unwrap(await sb.rpc('admin_set_default_role', { new_role: role }).single<{ default_role: AppSettings['defaultRole'] }>());
        return { defaultRole: row.default_role };
      }
    }
  };
}
