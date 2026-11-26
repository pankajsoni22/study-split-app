-- =====================================================================================
-- Remove Brief/Detailed reading levels (decided 2026-11-26): every reader sees the whole article.
--   1. Strip the per-block `visibility` flag from every saved document (drafts and published versions).
--      Nothing is deleted: blocks that were "brief only" or "detailed only" simply become normal blocks.
--   2. save_draft / get_published_article no longer read or return has_brief.
--   3. Drop articles.has_brief.
-- Safe to run twice. Safe for the app version before and after this change (old apps send/expect hasBrief,
-- which is now ignored / absent).
-- =====================================================================================

-- 1. Strip `visibility` from every node's attrs, at any depth.
create or replace function public._strip_block_visibility(j jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
  result jsonb;
begin
  if jsonb_typeof(j) = 'object' then
    result := '{}'::jsonb;
    for k, v in select key, value from jsonb_each(j) loop
      if k = 'attrs' and jsonb_typeof(v) = 'object' then
        v := v - 'visibility';
      end if;
      result := result || jsonb_build_object(k, public._strip_block_visibility(v));
    end loop;
    return result;
  elsif jsonb_typeof(j) = 'array' then
    return coalesce((select jsonb_agg(public._strip_block_visibility(e) order by o)
                       from jsonb_array_elements(j) with ordinality as t(e, o)), '[]'::jsonb);
  end if;
  return j;
end $$;

update public.article_drafts   set doc = public._strip_block_visibility(doc) where doc::text like '%"visibility"%';
update public.article_versions set doc = public._strip_block_visibility(doc) where doc::text like '%"visibility"%';

drop function public._strip_block_visibility(jsonb);

-- 2. Same as 20261122010000_trash.sql, without has_brief.
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
    reading_minutes = coalesce((p_meta ->> 'readingMinutes')::int, 0)
  where id = p_article_id;

  return new_version;
end $$;

create or replace function public.get_published_article(p_username text, p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'title', a.title, 'summary', a.summary, 'tags', to_jsonb(a.tags),
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
  where p.username = lower(p_username)::extensions.citext
    and a.slug = lower(p_slug)::extensions.citext
    and a.status = 'published'
    and a.deleted_at is null
    and (a.visibility <> 'private' or a.owner_id = auth.uid() or public.is_admin())
$$;

-- 3. The column (its column-level UPDATE grant goes with it).
alter table public.articles drop column if exists has_brief;

notify pgrst, 'reload schema';
