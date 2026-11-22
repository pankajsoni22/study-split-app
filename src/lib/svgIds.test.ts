import { describe, expect, it } from 'vitest';
import { scopeSvgIds } from './svgIds.ts';

describe('scopeSvgIds', () => {
  const svg = '<svg><defs><clipPath id="f3"><rect/></clipPath><linearGradient id="g"/></defs>'
    + '<g clip-path="url(#f3)"><path fill="url(#g)"/><use href="#f3"/><use xlink:href="#g"/><a href="#other"/></g></svg>';

  it('prefixes ids and every reference to them', () => {
    const out = scopeSvgIds(svg, 'p1_');
    expect(out).toContain('id="p1_f3"');
    expect(out).toContain('clip-path="url(#p1_f3)"');
    expect(out).toContain('fill="url(#p1_g)"');
    expect(out).toContain('href="#p1_f3"');
    expect(out).toContain('xlink:href="#p1_g"');
    expect(out).not.toMatch(/url\(#f3\)/);
  });

  it('leaves references to ids it does not define alone', () => {
    expect(scopeSvgIds(svg, 'p1_')).toContain('href="#other"');
  });

  it('two copies of the same SVG no longer share ids', () => {
    const a = scopeSvgIds(svg, 'a_');
    const b = scopeSvgIds(svg, 'b_');
    const idsOf = (s: string) => [...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    expect(idsOf(a).filter(id => idsOf(b).includes(id))).toEqual([]);
  });

  it('returns markup without ids unchanged', () => {
    expect(scopeSvgIds('<svg><path/></svg>', 'x_')).toBe('<svg><path/></svg>');
  });
});
