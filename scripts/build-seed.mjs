// Generates supabase/seed.sql: LOCAL test users and sample articles (never runs against production).
//   node scripts/build-seed.mjs        (then `npm run db:reset` to load it)
// Edit the data below, not seed.sql. See docs/04-local-development.md §5.
import { writeFileSync } from 'node:fs';

const PASSWORD = 'study-split-dev';   // local only; shown on the dev sign-in buttons
const users = [
  { id: '00000000-0000-4000-a000-000000000001', email: 'admin@study-split.local', name: 'Dev Admin', username: 'dev-admin', role: 'admin' },
  { id: '00000000-0000-4000-a000-000000000002', email: 'writer@study-split.local', name: 'Dev Writer', username: 'dev-writer', role: 'writer' },
  { id: '00000000-0000-4000-a000-000000000003', email: 'reader@study-split.local', name: 'Dev Reader', username: 'dev-reader', role: 'reader' }
];

const SIZES = { '50-50': [1400, 1400], '40-60': [1600, 1200] };
const GAP = 6000;
let seq = 0;
const id = p => `${p}_${(++seq).toString(36).padStart(4, '0')}`;
const text = t => ({ type: 'text', text: t });
const p = (t, visibility) => ({ type: 'paragraph', ...(visibility ? { attrs: { visibility } } : {}), content: [text(t)] });
const bullets = (items, visibility) => ({ type: 'bulletList', ...(visibility ? { attrs: { visibility } } : {}),
  content: items.map(i => ({ type: 'listItem', content: [p(i)] })) });
const callout = (tone, t) => ({ type: 'callout', attrs: { tone }, content: [p(t)] });
const details = (tone, summary, body) => ({ type: 'details', attrs: { tone }, content: [
  { type: 'detailsSummary', content: [text(summary)] }, { type: 'detailsContent', content: [p(body)] }] });

/** Builds doc + canvas: one H2 section and one slide (frame) per entry. */
function article(layout, sections) {
  const [w, h] = SIZES[layout];
  const doc = { type: 'doc', content: [] };
  const elements = [];
  sections.forEach((s, i) => {
    const frameId = id('frame'), x0 = i * (w + GAP);
    doc.content.push({ type: 'heading', attrs: { level: 2, sectionId: id('s'), frameId }, content: [text(s.title)] }, ...s.body);
    elements.push({ id: frameId, type: 'frame', x: x0, y: 0, width: w, height: h, name: s.title });
    (s.boxes ?? []).forEach((b, j) => {
      const bx = x0 + 120 + j * 420, by = 220;
      elements.push({ id: id('r'), type: 'rectangle', x: bx, y: by, width: 320, height: 130, frameId,
        strokeColor: b.stroke, backgroundColor: b.fill, fillStyle: 'solid', roundness: { type: 3 }, strokeWidth: 2, roughness: 1 });
      elements.push({ id: id('t'), type: 'text', x: bx + 30, y: by + 48, width: 260, height: 35, frameId, text: b.label, originalText: b.label,
        fontSize: 28, fontFamily: 5, textAlign: 'center', verticalAlign: 'middle', strokeColor: '#1e1e1e', autoResize: false, lineHeight: 1.25 });
      if (j > 0) elements.push({ id: id('a'), type: 'arrow', x: bx - 100, y: by + 65, width: 100, height: 0, frameId,
        points: [[0, 0], [100, 0]], strokeColor: '#1e1e1e', endArrowhead: 'arrow', strokeWidth: 2, roughness: 1 });
    });
  });
  return { doc, canvas: { layout, files: {}, elements } };
}

const teal = { stroke: '#0f766e', fill: '#ccfbf1' }, amber = { stroke: '#b45309', fill: '#fef3c7' }, sky = { stroke: '#0369a1', fill: '#e0f2fe' };
const articles = [
  { key: 'url', owner: 1, slug: 'url-shortener', title: 'Designing a URL Shortener', state: 'published', tags: ['system-design'],
    summary: 'Requirements, API, storage and scaling for a TinyURL-style service.',
    ...article('50-50', [
      { title: 'Requirements', boxes: [{ ...teal, label: 'Shorten URL' }, { ...amber, label: 'Redirect fast' }], body: [
        p('Users submit a long URL and get a short alias; visiting the alias redirects to the original.'),
        bullets(['100M new URLs a month', 'Reads outnumber writes 100 : 1', 'Redirect under 50 ms'], 'brief'),
        p('Non-goals for v1: custom domains, analytics dashboards and editing a link after it is created.', 'detail')] },
      { title: 'High-level design', boxes: [{ ...sky, label: 'Client' }, { ...teal, label: 'API service' }, { ...amber, label: 'Key-value store' }], body: [
        p('Clients call a stateless API service behind a load balancer. Short codes map to long URLs in a key-value store.'),
        callout('mint', 'Key idea: generate IDs from a counter and encode them in base62 — 7 characters give 3.5 trillion codes.'),
        details('sky', 'Why not hash the long URL?', 'Hashes collide and need a retry loop; a counter never collides and keeps codes short.')] },
      { title: 'Scaling reads', boxes: [{ ...teal, label: 'CDN / cache' }, { ...amber, label: 'Read replicas' }], body: [
        p('Most traffic is redirects, so cache hot codes at the edge and in Redis; misses go to read replicas.'),
        callout('red', 'Watch out: cache 301 redirects carefully — browsers keep them forever.')] }
    ]) },
  { key: 'hash', owner: 1, slug: 'consistent-hashing', title: 'Consistent Hashing', state: 'draft', tags: ['distributed-systems'],
    summary: 'Spreading keys across servers so adding one moves only a few keys.',
    ...article('40-60', [
      { title: 'The problem', boxes: [{ ...sky, label: 'hash(key) % N' }], body: [
        p('With modulo hashing, changing N remaps almost every key — a cache stampede on every deploy.')] },
      { title: 'The ring', boxes: [{ ...teal, label: 'Node A' }, { ...teal, label: 'Node B' }, { ...teal, label: 'Node C' }], body: [
        p('Place servers and keys on a ring; each key belongs to the next server clockwise.'),
        details('mint', 'Virtual nodes', 'Each server takes many points on the ring so load evens out.')] }
    ]) },
  { key: 'old', owner: 1, slug: 'old-notes', title: 'Old notes (in Trash)', state: 'trash', tags: [],
    summary: null, ...article('50-50', [{ title: 'Scratch', body: [p('Moved to Trash two days ago — restore it from the Trash page.')] }]) },
  { key: 'welcome', owner: 0, slug: 'welcome', title: 'Welcome to Study Split', state: 'published', tags: ['meta'],
    summary: 'What this site is and how articles work.',
    ...article('50-50', [{ title: 'How it works', boxes: [{ ...teal, label: 'Text' }, { ...amber, label: 'Slides' }], body: [
      p('Write on the left, draw on the right. Every H2 section gets its own slide.'),
      p('Readers switch between Split, Present and Article modes, and between Brief and Detailed.', 'detail')] }]) }
];

const q = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const j = v => `${q(JSON.stringify(v))}::jsonb`;
const out = [];
out.push(`-- GENERATED by scripts/build-seed.mjs — edit that file, then run: node scripts/build-seed.mjs
-- LOCAL DEVELOPMENT ONLY. Loaded by \`supabase db reset\` / \`npm run setup\`. Never run this on production.
-- Test users (password "${PASSWORD}"): ${users.map(u => `${u.username} (${u.role})`).join(', ')}.
`);
for (const u of users) {
  out.push(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', ${q(u.id)}, 'authenticated', 'authenticated', ${q(u.email)},
  extensions.crypt(${q(PASSWORD)}, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', ${j({ full_name: u.name })}, now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), ${q(u.id)}, ${q(u.id)}, 'email', ${j({ sub: u.id, email: u.email, email_verified: true })}, now(), now(), now());
update public.profiles set username = ${q(u.username)}, username_confirmed = true, role = ${q(u.role)} where id = ${q(u.id)};
`);
}
for (const a of articles) {
  const owner = users[a.owner].id;
  out.push(`-- ${a.title}
insert into public.articles (owner_id, slug, title, summary, tags, has_brief, reading_minutes)
values (${q(owner)}, ${q(a.slug)}, ${q(a.title)}, ${q(a.summary)}, ${q(`{${a.tags.join(',')}}`)}, true, 3);
-- (separate statement: the draft row is created by the on_article_created trigger)
update public.article_drafts set doc = ${j(a.doc)}, canvas = ${j(a.canvas)}
where article_id = (select id from public.articles where owner_id = ${q(owner)} and slug = ${q(a.slug)});
`);
  if (a.state === 'published') out.push(`insert into public.article_versions (article_id, version, doc, canvas)
select article_id, 1, doc, canvas from public.article_drafts where article_id = (select id from public.articles where owner_id = ${q(owner)} and slug = ${q(a.slug)});
update public.articles set status = 'published', published_version = 1, published_at = now() - interval '1 day',
  published_draft_version = (select version from public.article_drafts where article_id = articles.id)
where owner_id = ${q(owner)} and slug = ${q(a.slug)};
`);
  if (a.state === 'trash') out.push(`update public.articles set deleted_at = now() - interval '2 days' where owner_id = ${q(owner)} and slug = ${q(a.slug)};
`);
}
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), out.join('\n'));
console.log(`supabase/seed.sql: ${users.length} users, ${articles.length} articles`);
