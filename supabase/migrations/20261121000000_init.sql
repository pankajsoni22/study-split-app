-- =====================================================================================
-- Study Split — initial schema (Phase 0)
-- Portable Postgres: everything Supabase-specific is limited to auth.uid(), auth.users
-- and the storage schema (see docs/01-product-and-architecture.md §11.4).
-- =====================================================================================

create extension if not exists citext;

-- ---------- Types -------------------------------------------------------------------
create type public.user_role          as enum ('reader', 'writer', 'admin');
create type public.article_status     as enum ('draft', 'published', 'archived');
create type public.article_visibility as enum ('public', 'unlisted', 'private');

-- ---------- Shared helpers ----------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- App settings (single row) ------------------------------------------------
create table public.app_settings (
  id           boolean primary key default true check (id),           -- enforces one row
  default_role public.user_role not null default 'reader'
               check (default_role in ('reader', 'writer')),           -- never auto-grant admin
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);
insert into public.app_settings default values;

-- ---------- Usernames ---------------------------------------------------------------
create table public.reserved_usernames (name citext primary key);
insert into public.reserved_usernames (name) values
  ('about'),('account'),('admin'),('api'),('app'),('articles'),('assets'),('auth'),('blog'),
  ('dashboard'),('docs'),('edit'),('explore'),('help'),('home'),('login'),('logout'),('me'),
  ('new'),('null'),('onboarding'),('privacy'),('profile'),('public'),('root'),('search'),
  ('settings'),('signin'),('signout'),('signup'),('static'),('studysplit'),('study-split'),
  ('support'),('system'),('tags'),('terms'),('undefined'),('user'),('users'),('write');

-- Same rules as src/domain/username.ts (keep in sync).
create or replace function public.username_is_valid(name text)
returns boolean language sql immutable as $$
  select name ~ '^[a-z][a-z0-9-]{2,29}$' and name !~ '--' and name !~ '-$'
$$;

-- ---------- Profiles ------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  username            citext not null unique check (public.username_is_valid(username::text)),
  username_confirmed  boolean not null default false,       -- false until the user accepts/changes it
  username_changed_at timestamptz,
  display_name        text check (char_length(display_name) <= 80),
  avatar_url          text,
  bio                 text check (char_length(bio) <= 280),
  role                public.user_role not null default 'reader',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('writer', 'admin'))
$$;

-- Builds a free, valid username from any text (name, email local part). Appends a number if taken.
create or replace function public.suggest_username(seed text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  base := lower(coalesce(seed, ''));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '(^-+|-+$)', '', 'g');
  base := regexp_replace(base, '^[0-9-]+', '');               -- must start with a letter
  if char_length(base) < 3 then base := 'writer' || coalesce(nullif(base, ''), ''); end if;
  base := regexp_replace(left(base, 24), '-+$', '');
  candidate := base;
  while not public.username_is_valid(candidate)
     or exists (select 1 from public.profiles p where p.username = candidate::citext)
     or exists (select 1 from public.reserved_usernames r where r.name = candidate::citext)
  loop
    n := n + 1;
    candidate := base || '-' || n;
    if n > 50 then candidate := base || '-' || floor(random() * 90000 + 10000)::int; end if;
  end loop;
  return candidate;
end $$;

-- New auth user → profile with a suggested username and the admin-configured default role.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  seed text  := coalesce(meta ->> 'full_name', meta ->> 'name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username, display_name, avatar_url, role)
  values (
    new.id,
    public.suggest_username(seed),
    left(coalesce(meta ->> 'full_name', meta ->> 'name'), 80),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture'),
    (select default_role from public.app_settings where id)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Articles ------------------------------------------------------------------
create table public.articles (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  slug              citext not null check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title             text not null default 'Untitled' check (char_length(title) <= 160),
  summary           text check (char_length(summary) <= 400),
  tags              text[] not null default '{}' check (cardinality(tags) <= 10),
  status            public.article_status not null default 'draft',
  visibility        public.article_visibility not null default 'public',
  has_brief         boolean not null default false,
  reading_minutes   int not null default 0,
  template_key      text,
  cover_url         text,
  published_version int,
  snapshot_path     text,                      -- Storage path of the published, immutable snapshot
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  published_at      timestamptz,
  unique (owner_id, slug)
);
create index articles_feed_idx on public.articles (published_at desc)
  where status = 'published' and visibility = 'public';
create index articles_owner_idx on public.articles (owner_id, updated_at desc);
create index articles_tags_idx  on public.articles using gin (tags);
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();

create table public.article_drafts (
  article_id uuid primary key references public.articles (id) on delete cascade,
  doc        jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  canvas     jsonb not null default '{"elements":[],"files":{}}'::jsonb,
  version    int not null default 1,                      -- optimistic lock for save_draft
  updated_at timestamptz not null default now()
);

create table public.article_versions (
  article_id    uuid not null references public.articles (id) on delete cascade,
  version       int not null,
  snapshot_path text,
  doc           jsonb not null,
  canvas        jsonb not null,
  published_at  timestamptz not null default now(),
  primary key (article_id, version)
);

-- View counter (FR-24). Written only through record_view().
create table public.article_stats (
  article_id uuid primary key references public.articles (id) on delete cascade,
  views      bigint not null default 0
);

-- Every new article gets its draft row and stats row.
create or replace function public.handle_new_article()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.article_drafts (article_id) values (new.id);
  insert into public.article_stats  (article_id) values (new.id);
  return new;
end $$;
create trigger on_article_created after insert on public.articles
  for each row execute function public.handle_new_article();

-- ---------- Tags catalogue (suggestions + featured) ------------------------------------
create table public.tags (
  slug        citext primary key check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label       text not null,
  featured    boolean not null default false,
  usage_count int not null default 0
);
insert into public.tags (slug, label, featured) values
  ('system-design', 'System Design', true),
  ('interview-experience', 'Interview Experience', true),
  ('dsa', 'DSA', true),
  ('backend', 'Backend', true),
  ('frontend', 'Frontend', true),
  ('devops', 'DevOps', true),
  ('projects', 'Projects', true),
  ('ai-ml', 'AI / ML', true);

-- ---------- Link-preview cache (written by the Edge Function with the service role) -----
create table public.link_previews (
  url_hash    text primary key,
  url         text not null,
  embeddable  boolean not null default false,
  title       text,
  site_name   text,
  image_url   text,
  reader_html text,
  fetched_at  timestamptz not null default now()
);

-- =====================================================================================
-- Row-Level Security
-- =====================================================================================
alter table public.app_settings       enable row level security;
alter table public.reserved_usernames enable row level security;
alter table public.profiles           enable row level security;
alter table public.articles           enable row level security;
alter table public.article_drafts     enable row level security;
alter table public.article_versions   enable row level security;
alter table public.article_stats      enable row level security;
alter table public.tags               enable row level security;
alter table public.link_previews      enable row level security;   -- no policies: service role only

-- app_settings: everyone may read (the client shows it in Admin); writes via admin RPC only.
create policy app_settings_read on public.app_settings for select using (true);

-- profiles: confirmed profiles are public; you always see your own; admin sees all.
create policy profiles_read on public.profiles for select
  using (username_confirmed or id = auth.uid() or public.is_admin());
-- Only harmless columns are directly updatable (username/role go through RPCs).
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant  update (display_name, bio, avatar_url) on public.profiles to authenticated;

-- articles
create policy articles_read on public.articles for select using (
  (status = 'published' and visibility in ('public', 'unlisted'))
  or owner_id = auth.uid()
  or public.is_admin()
);
create policy articles_insert on public.articles for insert
  with check (owner_id = auth.uid() and public.can_write());
create policy articles_update on public.articles for update
  using ((owner_id = auth.uid() and public.can_write()) or public.is_admin())
  with check ((owner_id = auth.uid() and public.can_write()) or public.is_admin());
create policy articles_delete on public.articles for delete
  using ((owner_id = auth.uid() and public.can_write()) or public.is_admin());

-- drafts & versions: owner (writer) or admin only. Public readers use the Storage snapshot.
create policy drafts_rw on public.article_drafts for all using (
  public.is_admin() or exists (
    select 1 from public.articles a where a.id = article_id and a.owner_id = auth.uid() and public.can_write())
) with check (
  public.is_admin() or exists (
    select 1 from public.articles a where a.id = article_id and a.owner_id = auth.uid() and public.can_write())
);
create policy versions_read on public.article_versions for select using (
  public.is_admin() or exists (select 1 from public.articles a where a.id = article_id and a.owner_id = auth.uid())
);

-- stats: readable when the article is readable.
create policy stats_read on public.article_stats for select using (
  exists (select 1 from public.articles a where a.id = article_id)   -- RLS on articles applies
);

-- tags: public read; admin manages.
create policy tags_read  on public.tags for select using (true);
create policy tags_admin on public.tags for all using (public.is_admin()) with check (public.is_admin());

-- reserved names: readable (client can explain why a name is unavailable).
create policy reserved_read on public.reserved_usernames for select using (true);

-- =====================================================================================
-- RPCs (the client calls these; each is one round trip)
-- =====================================================================================

-- Keep-alive for the free tier (GitHub Actions / cron-job.org). Touches the DB, returns nothing sensitive.
create or replace function public.ping()
returns text language sql stable as $$ select 'ok:' || (select count(*) from public.app_settings)::text $$;
grant execute on function public.ping() to anon, authenticated;

create or replace function public.is_username_available(name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.username_is_valid(lower(name))
     and not exists (select 1 from public.reserved_usernames r where r.name = lower(name)::citext)
     and not exists (select 1 from public.profiles p where p.username = lower(name)::citext and p.id <> auth.uid())
$$;
grant execute on function public.is_username_available(text) to authenticated;

-- Accept the suggested username or pick another. Changing a confirmed username: once per 30 days.
create or replace function public.claim_username(name text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  wanted text := lower(trim(name));
begin
  if auth.uid() is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found' using errcode = 'P0002'; end if;

  if me.username_confirmed and me.username = wanted::citext then return me; end if;
  if me.username_confirmed and me.username_changed_at > now() - interval '30 days' then
    raise exception 'You can change your username once every 30 days' using errcode = 'P0001', hint = 'RATE_LIMIT';
  end if;
  if not public.is_username_available(wanted) then
    raise exception 'That username is not available' using errcode = 'P0001', hint = 'UNAVAILABLE';
  end if;

  update public.profiles
     set username = wanted::citext,
         username_changed_at = case when me.username_confirmed then now() else me.username_changed_at end,
         username_confirmed = true
   where id = auth.uid()
  returning * into me;
  return me;
end $$;
grant execute on function public.claim_username(text) to authenticated;

-- Admin: list users with emails (auth.users is not exposed to the client otherwise).
create or replace function public.admin_list_users()
returns table (id uuid, email text, username citext, display_name text, avatar_url text,
               role public.user_role, username_confirmed boolean, created_at timestamptz,
               last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.username, p.display_name, p.avatar_url, p.role,
           p.username_confirmed, p.created_at, u.last_sign_in_at
      from public.profiles p join auth.users u on u.id = p.id
     order by p.created_at desc;
end $$;
grant execute on function public.admin_list_users() to authenticated;

-- Admin: change a user's role. Admins can't demote themselves (prevents locking everyone out).
create or replace function public.admin_set_role(target uuid, new_role public.user_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'You cannot remove your own admin role' using errcode = 'P0001';
  end if;
  update public.profiles set role = new_role where id = target;
end $$;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;

-- Admin: default role for future sign-ups (FR-25).
create or replace function public.admin_set_default_role(new_role public.user_role)
returns public.app_settings language plpgsql security definer set search_path = '' as $$
declare s public.app_settings;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  update public.app_settings set default_role = new_role, updated_at = now(), updated_by = auth.uid()
   where id returning * into s;
  return s;
end $$;
grant execute on function public.admin_set_default_role(public.user_role) to authenticated;

-- View counter (FR-24): counts only articles the caller can read that are published.
-- The client de-duplicates per browser/article/24h; this returns the new total.
create or replace function public.record_view(target uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare total bigint;
begin
  update public.article_stats s set views = s.views + 1
    from public.articles a
   where s.article_id = target and a.id = target and a.status = 'published'
     and (a.visibility <> 'private' or a.owner_id = auth.uid() or public.is_admin())
  returning s.views into total;
  return coalesce(total, 0);
end $$;
grant execute on function public.record_view(uuid) to anon, authenticated;

-- Functions are executable by PUBLIC by default in Postgres; lock down the internal ones.
revoke execute on function public.handle_new_user()    from public, anon, authenticated;
revoke execute on function public.handle_new_article() from public, anon, authenticated;
revoke execute on function public.suggest_username(text) from public, anon, authenticated;

-- =====================================================================================
-- Storage buckets (Supabase-specific; S3/GCS equivalents on migration)
--   assets/{user_id}/...                      images pasted into articles/canvases
--   published/{user_id}/{article_id}/v{n}/... immutable published snapshots (CDN-cached)
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('assets',    'assets',    true, 5 * 1024 * 1024,
     array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']),
  ('published', 'published', true, 10 * 1024 * 1024,
     array['application/json','image/svg+xml'])
on conflict (id) do nothing;

create policy storage_writer_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('assets', 'published')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.can_write()
);
create policy storage_writer_update on storage.objects for update to authenticated using (
  bucket_id in ('assets', 'published') and (storage.foldername(name))[1] = auth.uid()::text and public.can_write()
);
create policy storage_writer_delete on storage.objects for delete to authenticated using (
  bucket_id in ('assets', 'published')
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
