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
