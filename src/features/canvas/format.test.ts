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
    expect(s.kinds).toEqual({ fill: true, edges: true, stroke: true, text: true });   // the label counts as text
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
