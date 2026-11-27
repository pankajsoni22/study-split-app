// Inline SVGs share one id namespace per page. Excalidraw exports define clip paths (one per frame, named after the
// frame) positioned relative to *that* export; when several slides are on screen, url(#id) resolves to the first
// match in the page, so every slide but the first got clipped away (blank thumbnails/slides). Prefixing all ids
// per rendered copy keeps each SVG self-contained.

/** Rewrites every id and every reference to it (url(#…), href="#…", xlink:href="#…") with a unique prefix. */
export function scopeSvgIds(markup: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of markup.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]!);
  if (ids.size === 0) return markup;
  const p = (id: string) => (ids.has(id) ? `${prefix}${id}` : id);
  return markup
    .replace(/(\sid=")([^"]+)(")/g, (_, a: string, id: string, b: string) => `${a}${p(id)}${b}`)
    .replace(/url\(\s*#([^)\s]+)\s*\)/g, (_, id: string) => `url(#${p(id)})`)
    .replace(/((?:xlink:)?href=")#([^"]+)(")/g, (_, a: string, id: string, b: string) => `${a}#${p(id)}${b}`);
}

let counter = 0;
/** A short unique prefix for one rendered copy. */
export function nextSvgPrefix(): string {
  counter += 1;
  return `s${counter}_`;
}

// Excalidraw exports embed each font as an @font-face holding ONLY the glyphs that export uses, under the shared
// name (e.g. "Excalifont"). Inline SVG styles are page-wide, so every new export re-declared "Excalifont" for the
// whole page and all text already on screen re-rendered while the new subset decoded (Unfold steps "wobbled",
// 2026-11-27). Renaming the families per rendered copy keeps each SVG's fonts to itself.

/** Renames every font family declared by an @font-face in the markup (and every use of it) with a unique prefix. */
export function scopeSvgFonts(markup: string, prefix: string, families?: Iterable<string>): string {
  // `families`: scope these names even though the markup does not declare them (fonts declared once elsewhere).
  const declared = new Set<string>(families);
  for (const m of markup.matchAll(/@font-face\s*\{[^}]*?font-family:\s*([^;]+);/g)) declared.add(unquote(m[1]!));
  if (declared.size === 0) return markup;
  const scopeList = (list: string) => list.split(',').map(f => {
    const name = unquote(f);
    return declared.has(name) ? `"${prefix}${name}"` : f.trim();
  }).join(', ');
  return markup
    .replace(/(font-family=")([^"]*)(")/g, (_, a: string, list: string, b: string) => `${a}${scopeList(list).replace(/"/g, "'")}${b}`)
    .replace(/(font-family:\s*)([^;}]+)(;|\})/g, (_, a: string, list: string, b: string) => `${a}${scopeList(list)}${b}`);
}

/** Just the @font-face rules of an exported SVG (to declare a picture's fonts once, apart from the picture). */
export function svgFontFaces(markup: string): string {
  return [...markup.matchAll(/@font-face\s*\{[^}]*\}/g)].map(m => m[0]).join('\n');
}

/** The font families an SVG's text asks for after scoping (to wait for them before showing it). */
export function svgFontFamilies(markup: string): string[] {
  const out = new Set<string>();
  for (const m of markup.matchAll(/@font-face\s*\{[^}]*?font-family:\s*([^;]+);/g)) out.add(unquote(m[1]!));
  return [...out];
}

const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '');
