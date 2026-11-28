-- Article links by a permanent short id (decided 2026-11-28): xyz.com/read/{id}, xyz.com/write/{id}.
--  * public_id: 12 random characters [A-Za-z0-9] (~71 bits), generated here, unique, never changed and never reused
--    (articles are never really deleted: "Delete forever" only hides them). It always contains a capital letter, so
--    it can never equal a slug (slugs are lowercase).
--  * slug: OPTIONAL second link (xyz.com/read/{slug}), empty until the writer sets one, unique across the whole site.
--    Existing slugs were made automatically from titles and are cleared; old /{username}/{slug} links stop working.

-- 0. Ids of articles an admin erased for good (docs/03 §3): remembered so they are never handed out again.
create table public.retired_public_ids (
  public_id  text primary key,
  retired_at timestamptz not null default now()
);
alter table public.retired_public_ids enable row level security;   -- no policies, no grants: database-only bookkeeping

-- 1. The id generator: unbiased random characters, retried until it has a capital and is unused (now or ever).
-- SECURITY DEFINER: it runs as the column default with the inserting user's rights, and its "unused?" check must see
-- every article (not only those the user may read). It only returns a random string, so anyone signed in may call it.
create or replace function public.new_public_id()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  bytes bytea;
  candidate text;
  b int;
  i int;
begin
  loop
    candidate := '';
    while char_length(candidate) < 12 loop
      -- Built-in strong randomness (no extension needed): two v4 UUIDs = 32 bytes; bytes 6 and 8 of each carry the
      -- UUID version/variant bits, so they are skipped.
      bytes := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
      for i in 0 .. 31 loop
        continue when i % 16 in (6, 8);
        b := get_byte(bytes, i);
        -- 248 = 4 × 62: skipping 248..255 keeps every character equally likely
        if b < 248 and char_length(candidate) < 12 then candidate := candidate || substr(alphabet, (b % 62) + 1, 1); end if;
      end loop;
    end loop;
    exit when candidate ~ '[A-Z]'
      and not exists (select 1 from public.articles where public_id = candidate)
      and not exists (select 1 from public.retired_public_ids where public_id = candidate);
  end loop;
  return candidate;
end $$;
revoke execute on function public.new_public_id() from public, anon;
grant execute on function public.new_public_id() to authenticated;

-- 2. The column: added, filled for existing articles, then required, unique and checked.
alter table public.articles add column public_id text;
update public.articles set public_id = public.new_public_id() where public_id is null;
alter table public.articles
  alter column public_id set default public.new_public_id(),
  alter column public_id set not null,
  add constraint articles_public_id_key unique (public_id),
  add constraint articles_public_id_format check (public_id ~ '^[A-Za-z0-9]{12}$' and public_id ~ '[A-Z]');

-- Never changed once set (writers have no UPDATE grant on it either; this also stops definer functions and admins),
-- and an id retired by erasing an article can never be given to a new one, not even by hand.
create or replace function public.keep_public_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.public_id is distinct from old.public_id then
    raise exception 'An article''s id never changes' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and exists (select 1 from public.retired_public_ids where public_id = new.public_id) then
    raise exception 'This article id was used before and is retired' using errcode = '23505';
  end if;
  return new;
end $$;
create trigger articles_keep_public_id before insert or update of public_id on public.articles
  for each row execute function public.keep_public_id();

-- Erasing an article for good retires its id (never reused).
create or replace function public.retire_public_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.retired_public_ids (public_id) values (old.public_id) on conflict do nothing;
  return old;
end $$;
create trigger articles_retire_public_id after delete on public.articles
  for each row execute function public.retire_public_id();

-- 3. Slug: optional, unique across the site (case-insensitive: citext), existing automatic ones cleared.
alter table public.articles drop constraint if exists articles_owner_id_slug_key;
alter table public.articles alter column slug drop not null;
update public.articles set slug = null;
create unique index articles_slug_key on public.articles (slug) where slug is not null;

-- Is this slug used by another article? (Writers cannot see other people's drafts, so the check runs as definer
-- and only answers yes/no.)
create or replace function public.slug_taken(p_slug text, p_except uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.articles where slug = p_slug::extensions.citext and id <> p_except)
$$;
revoke execute on function public.slug_taken(text, uuid) from public, anon;
grant execute on function public.slug_taken(text, uuid) to authenticated;

-- New articles have no slug (the old unique_slug helper is no longer needed).
create or replace function public.create_article(p_title text, p_template_key text, p_doc jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not public.can_write() then raise exception 'Writer access needed' using errcode = '42501'; end if;
  insert into public.articles (owner_id, title, template_key)
  values (me, coalesce(nullif(trim(p_title), ''), 'Untitled'), p_template_key)
  returning id into new_id;
  update public.article_drafts set doc = coalesce(p_doc, doc) where article_id = new_id;
  return new_id;
end $$;
drop function if exists public.unique_slug(uuid, text, uuid);

-- Save: as before, but the slug is optional and unique across the site.
create or replace function public.save_draft(p_article_id uuid, p_expected_version int,
                                             p_doc jsonb, p_canvas jsonb, p_meta jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  new_version int;
  wanted_slug text;
begin
  if exists (select 1 from public.articles where id = p_article_id and deleted_at is not null) then
    raise exception 'This article is in the Trash. Restore it first.' using errcode = 'P0001', hint = 'IN_TRASH';
  end if;
  if octet_length(p_doc::text) + octet_length(p_canvas::text) > 4 * 1024 * 1024 then
    raise exception 'This article is too large to save (over 4 MB). Remove large images from the canvas.'
      using errcode = 'P0001', hint = 'TOO_LARGE';
  end if;

  wanted_slug := nullif(trim(coalesce(p_meta ->> 'slug', '')), '');
  if wanted_slug is not null then
    wanted_slug := public.slugify(wanted_slug);
    if public.slug_taken(wanted_slug, p_article_id) then
      raise exception 'The slug "%" is already used by another article. Choose a different one.', wanted_slug
        using errcode = 'P0001', hint = 'SLUG_TAKEN';
    end if;
  end if;

  update public.article_drafts
     set doc = p_doc, canvas = p_canvas, version = version + 1, updated_at = now()
   where article_id = p_article_id and version = p_expected_version
  returning version into new_version;

  if new_version is null then
    if exists (select 1 from public.article_drafts where article_id = p_article_id) then
      raise exception 'This article was saved from somewhere else in the meantime.'
        using errcode = 'P0001', hint = 'CONFLICT';
    end if;
    raise exception 'Article not found' using errcode = 'P0002';
  end if;

  begin
    update public.articles set
      title           = coalesce(nullif(trim(p_meta ->> 'title'), ''), 'Untitled'),
      slug            = wanted_slug,
      summary         = nullif(trim(p_meta ->> 'summary'), ''),
      tags            = coalesce((select array_agg(distinct public.slugify(t)) from jsonb_array_elements_text(p_meta -> 'tags') t
                                  where public.slugify(t) <> 'untitled'), '{}'),
      visibility      = coalesce((p_meta ->> 'visibility')::public.article_visibility, visibility),
      reading_minutes = coalesce((p_meta ->> 'readingMinutes')::int, 0)
    where id = p_article_id;
  exception when unique_violation then   -- two writers took the same slug at the same moment
    raise exception 'The slug "%" is already used by another article. Choose a different one.', wanted_slug
      using errcode = 'P0001', hint = 'SLUG_TAKEN';
  end;

  return new_version;
end $$;

-- "Delete forever": as before, and the slug is released (the id stays with the hidden article for good).
create or replace function public.purge_article(p_article_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_or_admin(p_article_id) then raise exception 'You can only delete your own articles' using errcode = '42501'; end if;
  update public.articles set purged_at = now(), slug = null
   where id = p_article_id and deleted_at is not null and purged_at is null;
  if not found then raise exception 'Only articles in the Trash can be deleted forever' using errcode = 'P0002'; end if;
end $$;

-- 4. Reading: one key, the id or the slug (an id always has a capital letter; a slug never does).
drop function if exists public.get_published_article(text, text);
create or replace function public.get_published_article(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'publicId', a.public_id, 'slug', a.slug, 'title', a.title, 'summary', a.summary, 'tags', to_jsonb(a.tags),
    'visibility', a.visibility, 'readingMinutes', a.reading_minutes,
    'publishedAt', a.published_at, 'updatedAt', v.published_at, 'version', v.version,
    'views', coalesce(s.views, 0), 'isOwner', a.owner_id = auth.uid(),
    'author', jsonb_build_object('username', p.username, 'displayName', p.display_name,
                                 'avatarUrl', p.avatar_url, 'bio', p.bio),
    'doc', v.doc, 'canvas', v.canvas)
  from public.articles a
  join public.profiles p on p.id = a.owner_id
  join public.article_versions v on v.article_id = a.id and v.version = a.published_version
  left join public.article_stats s on s.article_id = a.id
  where (a.public_id = p_key or (p_key !~ '[A-Z]' and a.slug = p_key::extensions.citext))
    and a.status = 'published'
    and a.deleted_at is null
    and (a.visibility <> 'private' or a.owner_id = auth.uid() or public.is_admin())
$$;
grant execute on function public.get_published_article(text) to anon, authenticated;

-- 5. "read" is now part of the site's addresses, so nobody can take it as a username.
insert into public.reserved_usernames (name) values ('read') on conflict do nothing;

notify pgrst, 'reload schema';
