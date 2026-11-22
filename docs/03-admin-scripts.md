# Study Split: admin scripts

Run these in the **Supabase SQL Editor**
(https://supabase.com/dashboard/project/zomiawpvdgazykrwkgjl/sql/new), which runs as the database owner.
The app itself can never hard-delete an article; these scripts are the only way.

---

## Articles and the Trash

An article goes through three states. The row is never removed by the app.

| State | `deleted_at` | `purged_at` | Who can see it | Restorable by |
|---|---|---|---|---|
| Active | null | null | readers (if published), owner, admin | — |
| In Trash | set | null | owner (Trash page), admin | owner (Restore), admin |
| Deleted forever | set | set | admin only | **admin only, with the script below** |

When an article is deleted forever, its address (slug) is renamed to `<slug>-deleted-<8 chars>` so the writer can reuse the
original address. Its drafts, published versions and view count stay in the database.

### 1. List deleted-forever articles

```sql
select a.id, p.username, a.title, a.slug, a.status, a.deleted_at, a.purged_at
from public.articles a join public.profiles p on p.id = a.owner_id
where a.purged_at is not null
order by a.purged_at desc;
```

### 2. Worst case: bring a deleted-forever article back to the owner's Trash

The owner can then restore it themselves from **Trash**. Replace `ARTICLE_ID`.

```sql
begin;

-- Put the original address back if it is still free; otherwise keep the renamed one.
update public.articles a
   set slug = regexp_replace(a.slug::text, '-deleted-[0-9a-f]{8}$', '')
 where a.id = 'ARTICLE_ID'
   and not exists (
     select 1 from public.articles b
      where b.owner_id = a.owner_id and b.id <> a.id
        and b.slug = regexp_replace(a.slug::text, '-deleted-[0-9a-f]{8}$', '')::extensions.citext);

update public.articles set purged_at = null
 where id = 'ARTICLE_ID' and purged_at is not null;   -- back in the owner's Trash

commit;
```

### 3. Permanently erase deleted-forever articles (irreversible)

Removes the article row, and with it (by cascade) its drafts, versions and view count.
**Take a backup first** (Actions → Backup database → Run workflow). The example erases articles deleted forever more
than 90 days ago.

```sql
begin;

-- Preview what will be erased:
select id, title, purged_at from public.articles
 where purged_at is not null and purged_at < now() - interval '90 days';

-- Erase:
delete from public.articles
 where purged_at is not null and purged_at < now() - interval '90 days';

commit;   -- or: rollback;  to cancel
```

Images uploaded to Storage for those articles (once image uploads exist) are not removed by this script.
