-- =====================================================================================
-- Publish tracking (decided 2026-11-24): remember which draft version was published, so the editor can
-- enable "Publish" only when the saved draft differs from what readers see.
-- Only publish_article (SECURITY DEFINER) writes it; writers have no UPDATE grant on this column.
-- =====================================================================================

alter table public.articles add column if not exists published_draft_version int;   -- safe to run twice

-- Same as before, plus: record the draft version that was published.
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
     set status = 'published', published_version = next_version, published_at = coalesce(published_at, now()),
         published_draft_version = d.version
   where id = p_article_id;
  return next_version;
end $$;

notify pgrst, 'reload schema';
