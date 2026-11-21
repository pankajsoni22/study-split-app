-- =====================================================================================
-- Phase 1: editor + publishing RPCs.
-- Each RPC is one round trip (docs §11.3). SECURITY INVOKER unless noted, so RLS applies.
-- =====================================================================================

-- Slug from a title: "Designing a URL Shortener!" → "designing-a-url-shortener". Same rules as src/domain/slug.ts.
create or replace function public.slugify(p_text text)
returns text language sql immutable as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')), 80), ''), 'untitled')
$$;

-- Unique slug for this owner: appends -2, -3 … when taken.
create or replace function public.unique_slug(p_owner uuid, p_base text, p_except uuid default null)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  base text := regexp_replace(left(public.slugify(p_base), 74), '-+$', '');
  candidate text := base;
  n int := 1;
begin
  while exists (select 1 from public.articles a
                 where a.owner_id = p_owner and a.slug = candidate::extensions.citext
                   and a.id is distinct from p_except) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  return candidate;
end $$;

-- New article (writer/admin). Returns its id; the draft row is created by the on_article_created trigger.
-- SECURITY DEFINER (uses the internal unique_slug helper); the writer check is explicit below.
create or replace function public.create_article(p_title text, p_template_key text, p_doc jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not public.can_write() then raise exception 'Writer access needed' using errcode = '42501'; end if;
  insert into public.articles (owner_id, slug, title, template_key)
  values (me, public.unique_slug(me, coalesce(nullif(trim(p_title), ''), 'untitled')),
          coalesce(nullif(trim(p_title), ''), 'Untitled'), p_template_key)
  returning id into new_id;
  update public.article_drafts set doc = coalesce(p_doc, doc) where article_id = new_id;
  return new_id;
end $$;

-- Save the draft + metadata with optimistic locking. Returns the new version.
-- Errors (hint): CONFLICT (someone saved in between), SLUG_TAKEN, TOO_LARGE.
create or replace function public.save_draft(p_article_id uuid, p_expected_version int,
                                             p_doc jsonb, p_canvas jsonb, p_meta jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare
  new_version int;
  wanted_slug text;
begin
  if octet_length(p_doc::text) + octet_length(p_canvas::text) > 4 * 1024 * 1024 then
    raise exception 'This article is too large to save (over 4 MB). Remove large images from the canvas.'
      using errcode = 'P0001', hint = 'TOO_LARGE';
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

  wanted_slug := public.slugify(p_meta ->> 'slug');
  if exists (select 1 from public.articles a
              where a.owner_id = (select owner_id from public.articles where id = p_article_id)
                and a.slug = wanted_slug::extensions.citext and a.id <> p_article_id) then
    raise exception 'You already have an article with the address "%".', wanted_slug
      using errcode = 'P0001', hint = 'SLUG_TAKEN';
  end if;

  update public.articles set
    title           = coalesce(nullif(trim(p_meta ->> 'title'), ''), 'Untitled'),
    slug            = wanted_slug,
    summary         = nullif(trim(p_meta ->> 'summary'), ''),
    tags            = coalesce((select array_agg(distinct public.slugify(t)) from jsonb_array_elements_text(p_meta -> 'tags') t
                                where public.slugify(t) <> 'untitled'), '{}'),
    visibility      = coalesce((p_meta ->> 'visibility')::public.article_visibility, visibility),
    has_brief       = coalesce((p_meta ->> 'hasBrief')::boolean, false),
    reading_minutes = coalesce((p_meta ->> 'readingMinutes')::int, 0)
  where id = p_article_id;

  return new_version;
end $$;

-- Publish the current draft as a new immutable version. SECURITY DEFINER because article_versions
-- has no client write access; ownership is checked explicitly.
create or replace function public.publish_article(p_article_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  a public.articles;
  d public.article_drafts;
  next_version int;
begin
  select * into a from public.articles where id = p_article_id for update;
  if not found then raise exception 'Article not found' using errcode = 'P0002'; end if;
  if not ((a.owner_id = auth.uid() and public.can_write()) or public.is_admin()) then
    raise exception 'You can only publish your own articles' using errcode = '42501';
  end if;
  select * into d from public.article_drafts where article_id = p_article_id;

  select coalesce(max(version), 0) + 1 into next_version from public.article_versions where article_id = p_article_id;
  insert into public.article_versions (article_id, version, doc, canvas) values (p_article_id, next_version, d.doc, d.canvas);
  -- keep the last 20 versions
  delete from public.article_versions where article_id = p_article_id and version <= next_version - 20;

  update public.articles
     set status = 'published', published_version = next_version, published_at = coalesce(published_at, now())
   where id = p_article_id;
  return next_version;
end $$;

-- Back to draft (readers stop seeing it). Versions are kept.
create or replace function public.unpublish_article(p_article_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.articles set status = 'draft' where id = p_article_id;
  if not found then raise exception 'Article not found' using errcode = 'P0002'; end if;
end $$;

-- Everything the reader page needs in ONE call: metadata, author, published doc + canvas, views.
-- Returns null when the article doesn't exist or the caller may not read it.
create or replace function public.get_published_article(p_username text, p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', a.title, 'summary', a.summary, 'tags', to_jsonb(a.tags),
    'visibility', a.visibility, 'hasBrief', a.has_brief, 'readingMinutes', a.reading_minutes,
    'publishedAt', a.published_at, 'updatedAt', v.published_at, 'version', v.version,
    'views', coalesce(s.views, 0), 'isOwner', a.owner_id = auth.uid(),
    'author', jsonb_build_object('username', p.username, 'displayName', p.display_name,
                                 'avatarUrl', p.avatar_url, 'bio', p.bio),
    'doc', v.doc, 'canvas', v.canvas)
  from public.articles a
  join public.profiles p on p.id = a.owner_id
  join public.article_versions v on v.article_id = a.id and v.version = a.published_version
  left join public.article_stats s on s.article_id = a.id
  where p.username = lower(p_username)::extensions.citext
    and a.slug = lower(p_slug)::extensions.citext
    and a.status = 'published'
    and (a.visibility <> 'private' or a.owner_id = auth.uid() or public.is_admin())
$$;

-- SECURITY INVOKER functions use the citext type, which lives in the extensions schema.
grant usage on schema extensions to anon, authenticated;

revoke execute on function public.unique_slug(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.slugify(text)                                  to anon, authenticated;
grant execute on function public.create_article(text, text, jsonb)              to authenticated;
grant execute on function public.save_draft(uuid, int, jsonb, jsonb, jsonb)     to authenticated;
grant execute on function public.publish_article(uuid)                          to authenticated;
grant execute on function public.unpublish_article(uuid)                        to authenticated;
grant execute on function public.get_published_article(text, text)              to anon, authenticated;
