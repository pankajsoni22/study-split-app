// Runs every migration in supabase/migrations against a real Postgres (PGlite, in-process WASM) with
// small stand-ins for Supabase's auth and storage schemas, then checks roles, RLS and the RPC functions.
// Run: npm run test:db   (also runs in CI before every deploy)
import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { readdirSync, readFileSync } from 'node:fs';

const db = new PGlite({ extensions: { citext } });
// --- Minimal stand-ins for what Supabase provides -------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  -- Supabase's default privileges: new objects in public are granted to the API roles (RLS then filters rows).
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8')).join('\n'));
console.log('✓ migration applied');

process.on('unhandledRejection', e => { console.log('✗ UNEXPECTED:', e.message, '|', e.query); process.exit(1); });
const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid, fn) => { await db.exec(`set test.uid = '${uid ?? ''}'`); try { return await fn(); } finally { await db.exec(`reset test.uid`); } };
const expectFail = async (label, fn) => { try { await fn(); console.log('✗ expected failure:', label); process.exitCode = 1; } catch (e) { console.log('✓ refused:', label, '→', e.message); } };
const ok = (cond, label) => { console.log(cond ? '✓' : '✗', label); if (!cond) process.exitCode = 1; };

// Sign-ups → profiles with suggested usernames and the default role
const [u1] = await q(`insert into auth.users (email, raw_user_meta_data) values ('pankaj@x.com', '{"full_name":"Pankaj Soni","picture":"http://p"}') returning id`);
const [u2] = await q(`insert into auth.users (email, raw_user_meta_data) values ('other@x.com', '{"full_name":"Pankaj Soni"}') returning id`);
const [u3] = await q(`insert into auth.users (email) values ('admin@x.com') returning id`);
const profiles = await q(`select username::text, role, username_confirmed from public.profiles order by created_at`);
console.log('  profiles:', JSON.stringify(profiles));
ok(profiles[0].username === 'pankaj-soni' && profiles[1].username === 'pankaj-soni-2', 'suggested usernames are unique');
ok(profiles[2].username === 'admin-2' || profiles[2].username !== 'admin', 'reserved name avoided: ' + profiles[2].username);
ok(profiles.every(p => p.role === 'reader' && !p.username_confirmed), 'new users are unconfirmed readers');

// Run the rest as the "authenticated" role so RLS and grants apply
await db.exec(`set role authenticated`);

await as(u1.id, async () => {
  ok((await q(`select public.is_username_available('pankaj-soni') v`))[0].v === true, 'own suggestion is available to me');
  ok((await q(`select public.is_username_available('pankaj-soni-2') v`))[0].v === false, "someone else's name is unavailable");
  ok((await q(`select public.is_username_available('settings') v`))[0].v === false, 'reserved name is unavailable');
  const [p] = await q(`select (public.claim_username('pankaj-soni')).*`);
  ok(p.username_confirmed === true, 'claim_username confirms');
  await q(`select public.claim_username('pankaj-new')`);
  ok(true, 'first change after onboarding is allowed');
  await expectFail('second change within 30 days', () => q(`select public.claim_username('pankaj-third')`));
  await expectFail('reader updates own role', () => q(`update public.profiles set role = 'admin' where id = $1`, [u1.id]));
  await q(`update public.profiles set bio = 'hi' where id = $1`, [u1.id]);
  ok((await q(`select bio from public.profiles where id = $1`, [u1.id]))[0].bio === 'hi', 'reader can edit own bio');
  await expectFail('reader creates article', () => q(`insert into public.articles (owner_id, slug) values ($1, 'x')`, [u1.id]));
  await expectFail('reader lists users', () => q(`select * from public.admin_list_users()`));
});

// Promote u3 to admin (as the DB owner, like the README SQL)
await db.exec(`reset role`);
await q(`update public.profiles set role = 'admin', username_confirmed = true where id = $1`, [u3.id]);
await db.exec(`set role authenticated`);

await as(u3.id, async () => {
  const users = await q(`select * from public.admin_list_users()`);
  ok(users.length === 3, 'admin lists all users with emails');
  await q(`select public.admin_set_role($1, 'writer')`, [u1.id]);
  await expectFail('admin demotes self', () => q(`select public.admin_set_role($1, 'reader')`, [u3.id]));
  const [s] = await q(`select (public.admin_set_default_role('writer')).default_role r`);
  ok(s.r === 'writer', 'admin changes default role');
  await expectFail('default role admin', () => q(`select public.admin_set_default_role('admin')`));
});

await as(u2.id, async () => { await expectFail('non-admin sets default role', () => q(`select public.admin_set_default_role('reader')`)); });

// Writer creates articles; visibility rules
let pubId, privId;
await as(u1.id, async () => {
  [{ id: pubId }] = await q(`insert into public.articles (owner_id, slug, title, status, visibility, published_at) values ($1, 'url-shortener', 'URL Shortener', 'published', 'public', now()) returning id`, [u1.id]);
  [{ id: privId }] = await q(`insert into public.articles (owner_id, slug, title, status, visibility, published_at) values ($1, 'secret', 'Secret', 'published', 'private', now()) returning id`, [u1.id]);
  await q(`insert into public.articles (owner_id, slug, title) values ($1, 'draft-one', 'Draft')`, [u1.id]);
  ok((await q(`select count(*)::int n from public.articles`))[0].n === 3, 'owner sees all own articles');
  ok((await q(`select count(*)::int n from public.article_drafts`))[0].n === 3, 'draft rows auto-created');
});
await as(u2.id, async () => {
  ok((await q(`select count(*)::int n from public.articles`))[0].n === 1, 'others see only the public published one');
  ok((await q(`select count(*)::int n from public.article_drafts`))[0].n === 0, 'others see no drafts');
  ok(Number((await q(`select public.record_view($1) v`, [pubId]))[0].v) === 1, 'record_view counts public article');
  ok(Number((await q(`select public.record_view($1) v`, [privId]))[0].v) === 0, 'record_view ignores private article');
});
await as(u3.id, async () => {
  ok((await q(`select count(*)::int n from public.articles`))[0].n === 3, 'admin sees every article incl. private and draft');
});

// Anonymous visitor
await db.exec(`reset role; set role anon`);
ok((await q(`select count(*)::int n from public.articles`))[0].n === 1, 'anon sees only public published');
ok((await q(`select public.ping() p`))[0].p.startsWith('ok'), 'anon can ping');
const feed = await q(`select a.title, p.username::text, s.views from public.articles a join public.profiles p on p.id = a.owner_id left join public.article_stats s on s.article_id = a.id`);
console.log('  anon feed:', JSON.stringify(feed));
ok(feed.length === 1 && Number(feed[0].views) === 1, 'anon feed join works (profiles + stats)');
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
