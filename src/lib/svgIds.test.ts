import { describe, expect, it } from 'vitest';
import { scopeSvgFonts, scopeSvgIds, svgFontFaces, svgFontFamilies } from './svgIds.ts';

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

describe('scopeSvgFonts', () => {
  const svg = '<svg><style>@font-face { font-family: Excalifont; src: url(data:font/woff2;base64,AAA); } @font-face { font-family: "Lilita One"; src: url(x); }</style>'
    + '<text font-family="Excalifont, Xiaolai, Segoe UI Emoji">a</text><text font-family="Lilita One, Segoe UI Emoji">b</text>'
    + '<text font-family="Arial">c</text></svg>';
  it('renames declared families in @font-face rules and in text, leaving fallbacks and other fonts alone', () => {
    const out = scopeSvgFonts(svg, 's7_');
    expect(out).toContain('font-family: "s7_Excalifont";');
    expect(out).toContain('font-family: "s7_Lilita One";');
    expect(out).toContain(`font-family="'s7_Excalifont', Xiaolai, Segoe UI Emoji"`);
    expect(out).toContain(`font-family="'s7_Lilita One', Segoe UI Emoji"`);
    expect(out).toContain('font-family="Arial"');
    expect(svgFontFamilies(out)).toEqual(['s7_Excalifont', 's7_Lilita One']);
  });
  it('two copies of the same export no longer share a family name', () => {
    expect(svgFontFamilies(scopeSvgFonts(svg, 's1_'))).not.toEqual(svgFontFamilies(scopeSvgFonts(svg, 's2_')));
  });
  it('leaves markup without embedded fonts unchanged', () => {
    expect(scopeSvgFonts('<svg><text font-family="Excalifont">a</text></svg>', 's1_')).toBe('<svg><text font-family="Excalifont">a</text></svg>');
  });
});

describe('shared fonts (Unfold)', () => {
  it('svgFontFaces keeps only the @font-face rules', () => {
    const css = svgFontFaces('<svg><style>@font-face { font-family: Excalifont; src: url(a); } .x { fill: red; }</style></svg>');
    expect(css).toBe('@font-face { font-family: Excalifont; src: url(a); }');
  });
  it('scopes text to fonts declared elsewhere when the family list is given', () => {
    const layer = '<svg><text font-family="Excalifont, Xiaolai, Segoe UI Emoji">a</text></svg>';
    expect(scopeSvgFonts(layer, 's9_')).toBe(layer);
    expect(scopeSvgFonts(layer, 's9_', ['Excalifont'])).toContain(`font-family="'s9_Excalifont', Xiaolai, Segoe UI Emoji"`);
  });
});
