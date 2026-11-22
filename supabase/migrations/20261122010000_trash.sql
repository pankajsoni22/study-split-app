-- =====================================================================================
-- Trash (decided 2026-11-22). Articles are never deleted by the app:
--   active  → Trash          deleted_at set      (owner/admin can restore)
--   Trash   → deleted forever purged_at set      (hidden from the owner; NOT restorable in the app)
-- Rows stay in the database; only an admin removes them, by hand (docs/03-admin-scripts.md).
-- =====================================================================================

alter table public.articles add column deleted_at timestamptz;
alter table public.articles add column purged_at  timestamptz;
create index articles_trash_idx on public.articles (owner_id, deleted_at desc) where deleted_at is not null and purged_at is null;

-- ---- Row visibility -------------------------------------------------------------------
-- Readers: only live (not trashed) published public/unlisted articles.
-- Owner: their articles incl. Trash, but never deleted-forever ones. Admin: everything.
drop policy articles_read on public.articles;
create policy articles_read on public.articles for select using (
  (status = 'published' and visibility in ('public', 'unlisted') and deleted_at is null)
  or (owner_id = auth.uid() and purged_at is null)
  or public.is_admin()
);

-- No hard deletes from the app, by anyone.
drop policy articles_delete on public.articles;
revoke delete on public.articles from anon, authenticated;
revoke delete on public.article_drafts from anon, authenticated;

-- Writers may only change content columns; deleted_at / purged_at / ownership change only via the RPCs below.
revoke update on public.articles from anon, authenticated;
grant update (title, slug, summary, tags, visibility, has_brief, reading_minutes, status, template_key, cover_url)
  on public.articles to authenticated;

-- Drafts of trashed or deleted-forever articles can't be edited (and of deleted-forever ones can't be read).
drop policy drafts_rw on public.article_drafts;
create policy drafts_read on public.article_drafts for select using (
  public.is_admin() or exists (
    select 1 from public.articles a where a.id = article_id and a.owner_id = auth.uid() and a.purged_at is null and public.can_write())
);
create policy drafts_write on public.article_drafts for update using (
  public.is_admin() or exists (
    select 1 from public.articles a where a.id = article_id and a.owner_id = auth.uid() and a.deleted_at is null and public.can_write())
) with check (
  public.is_admin() or exists (
    select 1 from public.articles a where a.id = article_id and a.owner_id = auth.uid() and a.deleted_at is null and public.can_write())
);
-- (draft rows are only ever inserted by the on_article_created trigger, which runs as the table owner)
revoke insert on public.article_drafts from anon, authenticated;

-- ---- RPCs -------------------------------------------------------------------------------
create or replace function public.owns_or_admin(p_article_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or exists (
    select 1 from public.articles where id = p_article_id and owner_id = auth.uid() and public.can_write())
$$;

-- Move to Trash. Readers stop seeing it at once; status/visibility are kept so Restore is exact.
create or replace function public.trash_article(p_article_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_or_admin(p_article_id) then raise exception 'You can only delete your own articles' using errcode = '42501'; end if;
  update public.articles set deleted_at = now() where id = p_article_id and deleted_at is null and purged_at is null;
  if not found then raise exception 'Article not found or already in the Trash' using errcode = 'P0002'; end if;
end $$;

-- Back from Trash, exactly as it was. Refused once deleted forever.
create or replace function public.restore_article(p_article_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_or_admin(p_article_id) then raise exception 'You can only restore your own articles' using errcode = '42501'; end if;
  update public.articles set deleted_at = null where id = p_article_id and deleted_at is not null and purged_at is null;
  if not found then raise exception 'This article is not in the Trash' using errcode = 'P0002'; end if;
end $$;

-- "Delete forever": hidden from the owner for good. The row and its content stay for an admin's worst-case
-- recovery; the address (slug) is freed so the writer can reuse it.
create or replace function public.purge_article(p_article_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_or_admin(p_article_id) then raise exception 'You can only delete your own articles' using errcode = '42501'; end if;
  update public.articles
     set purged_at = now(),
         slug = left(slug::text, 60) || '-deleted-' || substr(replace(id::text, '-', ''), 1, 8)
   where id = p_article_id and deleted_at is not null and purged_at is null;
  if not found then raise exception 'Only articles in the Trash can be deleted forever' using errcode = 'P0002'; end if;
end $$;

-- Saving or publishing an article in the Trash is refused (restore it first).
create or replace function public.publish_article(p_article_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  a public.articles;
  d public.article_drafts;
  next_version int;
begin
  select * into a from public.articles where id = p_article_id for update;
  if not found or a.purged_at is not null then raise exception 'Article not found' using errcode = 'P0002'; end if;
  if a.deleted_at is not null then raise exception 'This article is in the Trash. Restore it first.' using errcode = 'P0001'; end if;
  if not ((a.owner_id = auth.uid() and public.can_write()) or public.is_admin()) then
    raise exception 'You can only publish your own articles' using errcode = '42501';
  end if;
  select * into d from public.article_drafts where article_id = p_article_id;
  select coalesce(max(version), 0) + 1 into next_version from public.article_versions where article_id = p_article_id;
  insert into public.article_versions (article_id, version, doc, canvas) values (p_article_id, next_version, d.doc, d.canvas);
  delete from public.article_versions where article_id = p_article_id and version <= next_version - 20;
  update public.articles
     set status = 'published', published_version = next_version, published_at = coalesce(published_at, now())
   where id = p_article_id;
  return next_version;
end $$;

-- Same as before, plus: a draft in the Trash can't be saved.
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
    has_brief       = coalesce((p_meta ->> 'hasBrief')::boolean, false),
    reading_minutes = coalesce((p_meta ->> 'readingMinutes')::int, 0)
  where id = p_article_id;

  return new_version;
end $$;

-- Readers never get trashed articles; views aren't counted for them.
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
    and a.deleted_at is null
    and (a.visibility <> 'private' or a.owner_id = auth.uid() or public.is_admin())
$$;

create or replace function public.record_view(target uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare total bigint;
begin
  update public.article_stats s set views = s.views + 1
    from public.articles a
   where s.article_id = target and a.id = target and a.status = 'published' and a.deleted_at is null
     and (a.visibility <> 'private' or a.owner_id = auth.uid() or public.is_admin())
  returning s.views into total;
  return coalesce(total, 0);
end $$;

revoke execute on function public.owns_or_admin(uuid) from public, anon, authenticated;
grant execute on function public.trash_article(uuid)   to authenticated;
grant execute on function public.restore_article(uuid) to authenticated;
grant execute on function public.purge_article(uuid)   to authenticated;

notify pgrst, 'reload schema';
