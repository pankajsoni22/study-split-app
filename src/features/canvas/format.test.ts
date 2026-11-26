import { describe, expect, it } from 'vitest';
import { reorder, restyle, summarize, type El } from './format.ts';

const rect: El = { id: 'r', type: 'rectangle', strokeColor: '#000', backgroundColor: 'transparent', roundness: { type: 3 }, strokeWidth: 2 };
const label: El = { id: 't', type: 'text', containerId: 'r', strokeColor: '#000', fontSize: 20, fontFamily: 5 };
const arrow: El = { id: 'a', type: 'arrow', strokeColor: '#0e7c6b', strokeWidth: 2 };
const frame: El = { id: 'f', type: 'frame' };
const all = [frame, rect, label, arrow];

describe('summarize', () => {
  it('shows defaults when nothing is selected', () => {
    const s = summarize(all, {}, { currentItemStrokeColor: '#c2410c', activeTool: { type: 'text' } });
    expect(s.count).toBe(0);
    expect(s.values.strokeColor).toBe('#c2410c');
    expect(s.kinds.text).toBe(true);
  });
  it('always carries the defaults for new shapes/text (used by the always-visible font picker)', () => {
    const s = summarize(all, { a: true }, { currentItemFontFamily: 6 });
    expect(s.kinds.text).toBe(false);
    expect(s.defaults.fontFamily).toBe(6);
  });

  it('reports shared values and mixed values', () => {
    const s = summarize(all, { r: true, a: true }, {});
    expect(s.count).toBe(2);
    expect(s.values.strokeWidth).toBe(2);
    expect(s.values.strokeColor).toBeUndefined();          // #000 vs teal: mixed
    expect(s.values.roundness).toBe('round');
    expect(s.kinds).toEqual({ stroke: true, line: true, fill: true, edges: true, text: true, font: true, arrow: true, any: true });   // the label counts as text
  });
});

describe('restyle', () => {
  it('colours a shape and its label together', () => {
    expect([...restyle(all, { r: true }, 'strokeColor', '#2557d6').keys()].sort()).toEqual(['r', 't']);
  });
  it('applies fill and edges only to shapes that have them', () => {
    expect([...restyle(all, { r: true, a: true }, 'backgroundColor', '#e3f3ef').keys()]).toEqual(['r']);
    expect(restyle(all, { r: true }, 'roundness', 'sharp').get('r')).toEqual({ roundness: null });
  });
  it('applies font settings to text only and never touches frames', () => {
    expect([...restyle(all, { r: true, f: true }, 'fontSize', 28).keys()]).toEqual(['t']);
  });
});

describe('reorder', () => {
  it('brings a shape and its label to the front', () => {
    expect(reorder(all, { r: true }, 'front').map(e => e.id)).toEqual(['f', 'a', 'r', 't']);
  });
  it('sends to the back but stays after frames', () => {
    expect(reorder(all, { a: true }, 'back').map(e => e.id)).toEqual(['f', 'a', 'r', 't']);
  });
});

describe('opacity and arrowheads (Style panel, 2026-11-26)', () => {
  const els = [
    { id: 'a', type: 'arrow', startArrowhead: null, endArrowhead: 'arrow', opacity: 100 },
    { id: 'r', type: 'rectangle', opacity: 60 }
  ];
  it('reads arrowheads ("none" for null) and opacity', () => {
    const s = summarize(els, { a: true }, {});
    expect(s.kinds.arrow).toBe(true);
    expect(s.values.startArrowhead).toBe('none');
    expect(s.values.endArrowhead).toBe('arrow');
    expect(s.values.opacity).toBe(100);
    expect(summarize(els, { a: true, r: true }, {}).values.opacity).toBeUndefined();   // mixed
  });
  it('sets arrowheads on arrows only ("none" becomes null) and opacity on everything', () => {
    expect([...restyle(els, { a: true, r: true }, 'startArrowhead', 'none')]).toEqual([['a', { startArrowhead: null }]]);
    expect([...restyle(els, { a: true, r: true }, 'endArrowhead', 'triangle').keys()]).toEqual(['a']);
    expect([...restyle(els, { a: true, r: true }, 'opacity', 50).keys()]).toEqual(['a', 'r']);
  });
  it('defaults map a null arrowhead to "none"', () => {
    expect(summarize([], {}, { currentItemStartArrowhead: null, currentItemEndArrowhead: 'arrow', currentItemOpacity: 100 }).defaults)
      .toMatchObject({ startArrowhead: 'none', endArrowhead: 'arrow', opacity: 100 });
  });
});

describe('only the controls that apply (2026-11-26)', () => {
  const tool = (type: string) => summarize([], {}, { activeTool: { type } }).kinds;
  it('select / hand tool with nothing selected: nothing to style', () => {
    expect(tool('selection').any).toBe(false);
    expect(tool('hand').any).toBe(false);
  });
  it('drawing tools show what the next shape can use', () => {
    expect(tool('rectangle')).toMatchObject({ stroke: true, line: true, fill: true, edges: true, font: true, text: false, arrow: false });
    expect(tool('ellipse')).toMatchObject({ fill: true, edges: false });
    expect(tool('arrow')).toMatchObject({ stroke: true, line: true, fill: false, arrow: true, font: false });
    expect(tool('freedraw')).toMatchObject({ stroke: true, line: true, fill: false, font: false });
    expect(tool('text')).toMatchObject({ stroke: true, line: false, fill: false, text: true, font: true });
  });
  it('a selection shows what it can use', () => {
    expect(summarize([arrow], { a: true }, {}).kinds).toMatchObject({ fill: false, edges: false, arrow: true, text: false, font: false });
    expect(summarize([{ id: 'i', type: 'image' }], { i: true }, {}).kinds.any).toBe(false);
    expect(summarize([{ id: 'x', type: 'text', strokeColor: '#000' }], { x: true }, {}).kinds).toMatchObject({ stroke: true, line: false, text: true, font: true });
  });
});
