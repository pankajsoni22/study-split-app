import { describe, expect, it } from 'vitest';
import { ensureSectionIds, readingMinutes, splitSections, type Doc } from './content.ts';
import { slugify, tagSlug } from './slug.ts';
import { buildTemplateDoc, TEMPLATES } from './templates.ts';

const p = (text: string) => ({ type: 'paragraph', attrs: {}, content: [{ type: 'text', text }] });
const h2 = (text: string, sectionId?: string, frameId?: string) => ({ type: 'heading', attrs: { level: 2, sectionId, frameId }, content: [{ type: 'text', text }] });

const doc: Doc = { type: 'doc', content: [p('intro'), h2('A', 's1', 'f1'), p('one'), p('two'), h2('B', 's2'), p('three')] };

describe('splitSections', () => {
  it('starts a section at every H2 and keeps an intro', () => {
    const s = splitSections(doc);
    expect(s.map(x => [x.id, x.title, x.frameId, x.nodes.length])).toEqual([['intro', 'Introduction', null, 1], ['s1', 'A', 'f1', 3], ['s2', 'B', null, 2]]);
  });
});

describe('readingMinutes / ensureSectionIds', () => {
  it('estimates reading time', () => {
    expect(readingMinutes({ type: 'doc', content: [] })).toBe(0);
    expect(readingMinutes({ type: 'doc', content: [p('word '.repeat(660))] })).toBe(3);
  });
  it('adds missing section ids only', () => {
    const d: Doc = { type: 'doc', content: [h2('X')] };
    const out = ensureSectionIds(d);
    expect(out).not.toBe(d);
    expect(typeof out.content[0]?.attrs?.sectionId).toBe('string');
    expect(ensureSectionIds(out)).toBe(out);
  });
});

describe('slugs', () => {
  it('matches the SQL slugify rules', () => {
    expect(slugify('System Design: Chat App!')).toBe('system-design-chat-app');
    expect(slugify('***')).toBe('untitled');
    expect(tagSlug('  ')).toBe('');
    expect(tagSlug('AI / ML')).toBe('ai-ml');
  });
});

describe('templates', () => {
  it('every template builds a valid doc', () => {
    for (const t of TEMPLATES) {
      const { doc: d, frameSections } = buildTemplateDoc(t);
      expect(d.content.length).toBeGreaterThan(0);
      expect(frameSections.length).toBe(t.sections.filter(s => s.frame).length);
    }
  });
});

describe('highlight boxes and collapsibles', () => {
  const box = () => ({ type: 'callout', attrs: { tone: 'mint' }, content: [p('inside a box ' + 'word '.repeat(300))] });
  const fold = { type: 'details', attrs: {}, content: [
    { type: 'detailsSummary', content: [{ type: 'text', text: 'Trade-off 1' }] },
    { type: 'detailsContent', content: [p('hidden until expanded ' + 'word '.repeat(300))] }] };

  it('counts text inside boxes and collapsibles for reading time', () => {
    expect(readingMinutes({ type: 'doc', content: [box(), fold] })).toBe(3);
  });
});
