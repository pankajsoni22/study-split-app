import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppSettings, Role, Tag } from '../../../domain/types.ts';
import { AppError } from '../../errors.ts';
import type { AuthSession, Services } from '../../ports.ts';
import { createSupabase } from './client.ts';
import { toAppError, unwrap } from './errors.ts';
import {
  ARTICLE_SUMMARY_COLUMNS, toAdminUser, toArticleSummary, toProfile, toPublicProfile,
  type AdminUserRow, type ArticleSummaryRow, type ProfileRow
} from './mappers.ts';

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
        return unwrap(await sb.rpc('is_username_available', { name: username })) === true;
      },
      async claimUsername(username) {
        return toProfile(unwrap(await sb.rpc('claim_username', { name: username }).single<ProfileRow>()));
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
          .eq('status', 'published').eq('visibility', 'public')
          .order('published_at', { ascending: false }).limit(limit);
        if (before) q = q.lt('published_at', before);
        if (tag) q = q.contains('tags', [tag]);
        return unwrap(await q.returns<ArticleSummaryRow[]>()).map(toArticleSummary);
      },
      async listPublishedBy(username) {
        const rows = unwrap(await sb.from('articles').select(ARTICLE_SUMMARY_COLUMNS)
          .eq('status', 'published').eq('visibility', 'public').eq('owner.username', username.toLowerCase())
          .order('published_at', { ascending: false }).limit(50).returns<ArticleSummaryRow[]>());
        return rows.map(toArticleSummary);
      },
      async listMine() {
        const id = await myId();
        const rows = unwrap(await sb.from('articles').select(ARTICLE_SUMMARY_COLUMNS)
          .eq('owner_id', id).order('updated_at', { ascending: false }).returns<ArticleSummaryRow[]>());
        return rows.map(toArticleSummary);
      },
      async recordView(articleId) {
        return Number(unwrap(await sb.rpc('record_view', { target: articleId })));
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
