-- =====================================================================================
-- Explicit Data API grants.
-- New Supabase projects no longer grant table access to the API roles (anon, authenticated)
-- automatically. Each grant below only lets a role *reach* a table; Row-Level Security
-- policies (previous migration) still decide which rows it can see or change.
-- =====================================================================================

grant usage on schema public to anon, authenticated;

-- Read-only reference data
grant select on public.app_settings       to anon, authenticated;
grant select on public.reserved_usernames to anon, authenticated;
grant select on public.tags               to anon, authenticated;
grant insert, update, delete on public.tags to authenticated;           -- RLS: admins only

-- Profiles: public read (confirmed only, via RLS); harmless columns editable by the owner.
-- username / role change only through claim_username() / admin_set_role().
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_url) on public.profiles to authenticated;

-- Articles and their bodies
grant select on public.articles to anon, authenticated;
grant insert, update, delete on public.articles to authenticated;     -- RLS: own (writer) or admin
grant select, insert, update, delete on public.article_drafts to authenticated;
grant select on public.article_versions to authenticated;
grant select on public.article_stats to anon, authenticated;          -- written only by record_view()

-- link_previews: intentionally no grants (Edge Function uses the service role).

-- Helper functions evaluated inside RLS policies and CHECK constraints run as the caller,
-- so the API roles must be able to execute them.
grant execute on function public.is_admin()                to anon, authenticated;
grant execute on function public.can_write()               to anon, authenticated;
grant execute on function public.username_is_valid(text)   to anon, authenticated;

-- RPCs (some were granted in the first migration; repeated here so this file is the full list)
grant execute on function public.ping()                                           to anon, authenticated;
grant execute on function public.record_view(uuid)                                to anon, authenticated;
grant execute on function public.is_username_available(text)                      to authenticated;
grant execute on function public.claim_username(text)                             to authenticated;
grant execute on function public.admin_list_users()                               to authenticated;
grant execute on function public.admin_set_role(uuid, public.user_role)           to authenticated;
grant execute on function public.admin_set_default_role(public.user_role)         to authenticated;
