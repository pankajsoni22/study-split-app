import { describe, expect, it } from 'vitest';
import { countsByStep, ensureBlockIds, stepIds, usesUnfold, visibleAt } from './unfold.ts';

const h2 = { type: 'heading', attrs: { level: 2, sectionId: 's1' }, content: [] };
const p = (id?: string) => ({ type: 'paragraph', attrs: id ? { blockId: id } : {}, content: [] });

describe('ensureBlockIds', () => {
  it('adds ids to blocks (not split headings) and fixes duplicates', () => {
    const d = ensureBlockIds({ type: 'doc', content: [h2, p('a'), p(), p('a')] });
    const ids = d.content.map(n => n.attrs?.blockId);
    expect(ids[0]).toBeUndefined();
    expect(ids[1]).toBe('a');
    expect(typeof ids[2]).toBe('string');
    expect(ids[3]).not.toBe('a');
    expect(ensureBlockIds(d)).toBe(d);
  });
  it('lists the steps of a split in order', () => expect(stepIds([h2, p('x'), p('y')])).toEqual(['x', 'y']));
});

describe('visibleAt', () => {
  const els = [
    { id: 'f', type: 'frame' },
    { id: 'base', type: 'rectangle', frameId: 'f' },                                   // untagged: always
    { id: 'r1', type: 'rectangle', frameId: 'f', customData: { unfold: 'x' } },
    { id: 'l1', type: 'text', frameId: 'f', containerId: 'r1' },                      // label follows its shape
    { id: 'r2', type: 'ellipse', frameId: 'f', customData: { unfold: 'y' } },
    { id: 'gone', type: 'line', frameId: 'f', customData: { unfold: 'deleted-paragraph' } },
    { id: 'other', type: 'rectangle', frameId: 'g', customData: { unfold: 'x' } }     // other split
  ];
  it('before the first paragraph: only untagged (and orphaned) parts', () => {
    expect([...visibleAt(els, 'f', ['x', 'y'], -1).visible].sort()).toEqual(['base', 'gone']);
  });
  it('builds up step by step; the current step is fresh', () => {
    const s0 = visibleAt(els, 'f', ['x', 'y'], 0);
    expect([...s0.visible].sort()).toEqual(['base', 'gone', 'l1', 'r1']);
    expect([...s0.fresh].sort()).toEqual(['l1', 'r1']);
    const s1 = visibleAt(els, 'f', ['x', 'y'], 1);
    expect(s1.visible.has('r2') && s1.visible.has('r1')).toBe(true);
    expect([...s1.fresh]).toEqual(['r2']);
  });
  it('counts parts per step and detects use', () => {
    expect(countsByStep(els).get('x')).toBe(2);   // r1 here + "other" in another split (label not counted)
    expect(usesUnfold({ unfold: true, elements: els })).toBe(true);
    expect(usesUnfold({ unfold: false, elements: els })).toBe(false);
  });
});
