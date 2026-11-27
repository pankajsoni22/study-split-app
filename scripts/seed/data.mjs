// LOCAL sample data: test users and articles (docs/04-local-development.md §5).
// Used by scripts/build-seed.mjs (→ supabase/seed.sql) and scripts/db-refresh-samples.mjs (update in place).
import { C, MORE, NOTE, P, UL, slideKit } from './draw.mjs';
import { consistentHashing } from './consistent-hashing.mjs';

export const PASSWORD = 'study-split-dev';   // local only; shown on the dev sign-in buttons
export const users = [
  { id: '00000000-0000-4000-a000-000000000001', email: 'admin@study-split.local', name: 'Dev Admin', username: 'dev-admin', role: 'admin' },
  { id: '00000000-0000-4000-a000-000000000002', email: 'writer@study-split.local', name: 'Dev Writer', username: 'dev-writer', role: 'writer' },
  { id: '00000000-0000-4000-a000-000000000003', email: 'reader@study-split.local', name: 'Dev Reader', username: 'dev-reader', role: 'reader' }
];

const SIZES = { '70-30': [900, 1500], '60-40': [1200, 1600], '50-50': [1400, 1400], '40-60': [1600, 1200], '30-70': [1600, 1000] };
const GAP = 6000;   // same as SLIDE_GAP in src/domain/layouts.ts

/** Simple slides for short sample articles: a row of labelled boxes joined by arrows. */
function boxesSlide(boxes) {
  return k => boxes.forEach((b, j) => {
    const x = 120 + j * 420, y = 220;
    k.box(x, y, 320, 130, b.label, { tone: b, size: 28 });
    if (j > 0) k.arrow([[x - 100, y + 65], [x - 4, y + 65]]);
  });
}

/** Turns an article definition into { doc, canvas, readingMinutes }. Ids are stable per article. */
export function buildArticle(def) {
  let n = 0;
  const nextId = p => `${def.slug}-${p}-${(++n).toString(36)}`;
  const [w, h] = SIZES[def.layout];
  const doc = { type: 'doc', content: [] };
  const elements = [];
  def.sections.forEach((s, i) => {
    const frameId = nextId('frame'), x0 = i * (w + GAP);
    // Every block gets a stable blockId (Unfold steps; see src/domain/unfold.ts).
    const body = s.body.map(b => ({ ...b, attrs: { ...(b.attrs ?? {}), blockId: nextId('b') } }));
    doc.content.push({ type: 'heading', attrs: { level: 2, sectionId: nextId('s'), frameId }, content: [{ type: 'text', text: s.title }] }, ...body);
    elements.push({ id: frameId, type: 'frame', x: x0, y: 0, width: w, height: h, name: s.title, seed: i + 1, strokeColor: '#bbb',
      backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, roughness: 0, opacity: 100, angle: 0, groupIds: [], frameId: null, roundness: null });
    const plain = node => node.text ?? (node.content ?? []).map(plain).join('');
    const kit = slideKit({ frameId, x0, nextId, blocks: body.map(b => ({ id: b.attrs.blockId, text: plain(b).replace(/\s+/g, ' ').trim() })) });
    (s.draw ?? (s.boxes ? boxesSlide(s.boxes) : () => {}))(kit);
    elements.push(...kit.els);
  });
  const textOf = node => node.text ?? (node.content ?? []).map(textOf).join(' ');
  const words = doc.content.map(textOf).join(' ').split(/\s+/).filter(Boolean).length;
  return { doc, canvas: { layout: def.layout, files: {}, elements, ...(def.unfold ? { unfold: true } : {}) }, readingMinutes: Math.max(1, Math.round(words / 220)) };
}

const teal = C.teal, amber = C.amber, sky = C.sky;
export const articles = [
  { key: 'url', owner: 1, slug: 'url-shortener', title: 'Designing a URL Shortener', state: 'published', layout: '50-50', tags: ['system-design'],
    summary: 'Requirements, API, storage and scaling for a TinyURL-style service.',
    sections: [
      { title: 'Requirements', boxes: [{ ...teal, label: 'Shorten URL' }, { ...amber, label: 'Redirect fast' }], body: [
        P('Users submit a long URL and get a short alias; visiting the alias redirects to the original.'),
        UL(['100M new URLs a month', 'Reads outnumber writes 100 : 1', 'Redirect under 50 ms']),
        P('Non-goals for v1: custom domains, analytics dashboards and editing a link after it is created.')] },
      { title: 'High-level design', boxes: [{ ...sky, label: 'Client' }, { ...teal, label: 'API service' }, { ...amber, label: 'Key-value store' }], body: [
        P('Clients call a stateless API service behind a load balancer. Short codes map to long URLs in a key-value store.'),
        NOTE('mint', 'Key idea: generate IDs from a counter and encode them in base62 — 7 characters give 3.5 trillion codes.'),
        MORE('sky', 'Why not hash the long URL?', 'Hashes collide and need a retry loop; a counter never collides and keeps codes short.')] },
      { title: 'Scaling reads', boxes: [{ ...teal, label: 'CDN / cache' }, { ...amber, label: 'Read replicas' }], body: [
        P('Most traffic is redirects, so cache hot codes at the edge and in Redis; misses go to read replicas.'),
        NOTE('red', 'Watch out: cache 301 redirects carefully — browsers keep them forever.')] }
    ] },
  consistentHashing,
  { key: 'old', owner: 1, slug: 'old-notes', title: 'Old notes (in Trash)', state: 'trash', layout: '50-50', tags: [], summary: null,
    sections: [{ title: 'Scratch', body: [P('Moved to Trash two days ago — restore it from the Trash page.')] }] },
  { key: 'welcome', owner: 0, slug: 'welcome', title: 'Welcome to Study Split', state: 'published', layout: '50-50', tags: ['meta'],
    summary: 'What this site is and how articles work.',
    sections: [{ title: 'How it works', boxes: [{ ...teal, label: 'Text' }, { ...amber, label: 'Slides' }], body: [
      P('Write on the left, draw on the right. Every H2 heading starts a new split: a piece of text with its own drawing.'),
      P('Readers switch between Split, Present and Article modes.')] }] }
];
