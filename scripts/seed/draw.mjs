// Tiny Excalidraw drawing kit for sample articles (scripts/seed/*). Coordinates are relative to the slide's
// top-left corner; every element is placed inside the slide's frame. See docs/04-local-development.md §5.

export const C = {
  ink: '#1e1e1e', muted: '#64748b',
  teal: { stroke: '#0f766e', fill: '#ccfbf1' },
  amber: { stroke: '#b45309', fill: '#fef3c7' },
  sky: { stroke: '#0369a1', fill: '#e0f2fe' },
  rose: { stroke: '#be123c', fill: '#ffe4e6' },
  violet: { stroke: '#6d28d9', fill: '#ede9fe' },
  green: { stroke: '#15803d', fill: '#dcfce7' },
  slate: { stroke: '#334155', fill: '#f1f5f9' }
};

/** Point on a circle, angle in degrees clockwise from 12 o'clock. */
export function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * Drawing context for one slide. `nextId` makes stable ids (and stable hand-drawn jitter via `seed`), so
 * regenerating the seed gives identical drawings.
 */
export function slideKit({ frameId, x0, y0 = 0, nextId }) {
  const els = [];
  const common = () => {
    const id = nextId('el');
    return { id, frameId, seed: hashSeed(id), roughness: 1, opacity: 100, angle: 0, strokeStyle: 'solid', groupIds: [] };
  };
  const at = (x, y) => ({ x: x0 + x, y: y0 + y });

  const kit = {
    els,
    rect(x, y, w, h, { stroke = C.ink, fill = 'transparent', sw = 2, round = true, dashed = false } = {}) {
      els.push({ ...common(), type: 'rectangle', ...at(x, y), width: w, height: h, strokeColor: stroke, backgroundColor: fill,
        fillStyle: 'solid', strokeWidth: sw, roundness: round ? { type: 3 } : null, strokeStyle: dashed ? 'dashed' : 'solid' });
      return kit;
    },
    ellipse(cx, cy, rx, ry = rx, { stroke = C.ink, fill = 'transparent', sw = 2, dashed = false } = {}) {
      els.push({ ...common(), type: 'ellipse', ...at(cx - rx, cy - ry), width: rx * 2, height: ry * 2, strokeColor: stroke,
        backgroundColor: fill, fillStyle: 'solid', strokeWidth: sw, roundness: null, strokeStyle: dashed ? 'dashed' : 'solid' });
      return kit;
    },
    /** Text; `align: 'center'` centres it on x. Multi-line with \n. */
    text(x, y, str, { size = 28, color = C.ink, align = 'left', mono = false, bold = false } = {}) {
      const lines = String(str).split('\n');
      const w = Math.max(...lines.map(l => l.length)) * size * (mono ? 0.62 : 0.56) + 4;
      const h = lines.length * size * 1.25;
      const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      els.push({ ...common(), type: 'text', ...at(left, y), width: w, height: h, text: str, originalText: str, fontSize: size,
        fontFamily: mono ? 3 : bold ? 6 : 5, textAlign: align, verticalAlign: 'top', strokeColor: color, backgroundColor: 'transparent',
        fillStyle: 'solid', strokeWidth: 1, roundness: null, lineHeight: 1.25, autoResize: true, containerId: null });
      return kit;
    },
    /** Box with centred text. */
    box(x, y, w, h, label, { tone = C.slate, size = 26, sw = 2, dashed = false, color = C.ink } = {}) {
      kit.rect(x, y, w, h, { stroke: tone.stroke, fill: tone.fill, sw, dashed });
      const n = String(label).split('\n').length;
      return kit.text(x + w / 2, y + h / 2 - (n * size * 1.25) / 2, label, { size, align: 'center', color });
    },
    /** Polyline through absolute slide points. */
    line(points, { stroke = C.ink, sw = 2, dashed = false } = {}) {
      return pushPath('line', points, { stroke, sw, dashed });
    },
    arrow(points, { stroke = C.ink, sw = 2, dashed = false, both = false } = {}) {
      return pushPath('arrow', points, { stroke, sw, dashed, both });
    },
    /** Arc of a circle as a smooth polyline (degrees clockwise from 12 o'clock; a2 may exceed 360). */
    arc(cx, cy, r, a1, a2, opts = {}) {
      const steps = Math.max(2, Math.ceil(Math.abs(a2 - a1) / 4));
      const pts = Array.from({ length: steps + 1 }, (_, i) => polar(cx, cy, r, a1 + ((a2 - a1) * i) / steps));
      return opts.arrow ? kit.arrow(pts, opts) : kit.line(pts, opts);
    },
    /** A server/node dot on a ring with its label outside the ring. */
    node(cx, cy, r, deg, label, { tone = C.teal, size = 30, dot = 30, labelGap = 58 } = {}) {
      const [x, y] = polar(cx, cy, r, deg);
      kit.ellipse(x, y, dot, dot, { stroke: tone.stroke, fill: tone.fill, sw: 3 });
      const [lx, ly] = polar(cx, cy, r + labelGap, deg);
      return kit.text(lx, ly - size * 0.62, label, { size, align: 'center', color: tone.stroke });
    },
    /** A key dot on a ring with its label inside the ring. */
    key(cx, cy, r, deg, label, { tone = C.slate, size = 24, dot = 11, labelGap = -44 } = {}) {
      const [x, y] = polar(cx, cy, r, deg);
      kit.ellipse(x, y, dot, dot, { stroke: tone.stroke, fill: tone.stroke, sw: 2 });
      const [lx, ly] = polar(cx, cy, r + labelGap, deg);
      return kit.text(lx, ly - size * 0.62, label, { size, align: 'center', color: tone.stroke });
    }
  };

  function pushPath(type, points, { stroke, sw, dashed, both = false }) {
    const [fx, fy] = points[0];
    const rel = points.map(([x, y]) => [x - fx, y - fy]);
    const xs = rel.map(p => p[0]), ys = rel.map(p => p[1]);
    els.push({ ...common(), type, ...at(fx, fy), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      points: rel, strokeColor: stroke, backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: sw, roundness: null,
      strokeStyle: dashed ? 'dashed' : 'solid', lastCommittedPoint: null,
      ...(type === 'arrow' ? { startArrowhead: both ? 'arrow' : null, endArrowhead: 'arrow', elbowed: false } : { startArrowhead: null, endArrowhead: null }) });
    return kit;
  }
  return kit;
}

function hashSeed(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h) % 2147483647 || 1;
}

// ---- TipTap document helpers ----
/** Inline text with **bold**, *italic* and `code`. */
export function rich(str) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  for (const m of str.matchAll(re)) {
    if (m.index > last) out.push({ type: 'text', text: str.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith('**')) out.push({ type: 'text', text: t.slice(2, -2), marks: [{ type: 'bold' }] });
    else if (t.startsWith('`')) out.push({ type: 'text', text: t.slice(1, -1), marks: [{ type: 'code' }] });
    else out.push({ type: 'text', text: t.slice(1, -1), marks: [{ type: 'italic' }] });
    last = m.index + t.length;
  }
  if (last < str.length) out.push({ type: 'text', text: str.slice(last) });
  return out;
}
export const P = t => ({ type: 'paragraph', content: rich(t) });
export const H3 = t => ({ type: 'heading', attrs: { level: 3 }, content: rich(t) });
export const UL = items => ({ type: 'bulletList', content: items.map(i => ({ type: 'listItem', content: [P(i)] })) });
export const OL = items => ({ type: 'orderedList', content: items.map(i => ({ type: 'listItem', content: [P(i)] })) });
export const NOTE = (tone, t) => ({ type: 'callout', attrs: { tone }, content: [P(t)] });
export const MORE = (tone, summary, paras) => ({ type: 'details', attrs: { tone }, content: [
  { type: 'detailsSummary', content: rich(summary) },
  { type: 'detailsContent', content: (Array.isArray(paras) ? paras : [paras]).map(x => (typeof x === 'string' ? P(x) : x)) }] });
export const CODE = (language, code) => ({ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text: code }] });
/** Table: first row is the header. Cells accept **bold** / `code` / *italic*. */
export const TABLE = (header, rows) => ({
  type: 'table',
  content: [
    { type: 'tableRow', content: header.map(h => ({ type: 'tableHeader', content: [P(h)] })) },
    ...rows.map(r => ({ type: 'tableRow', content: r.map(c => ({ type: 'tableCell', content: [P(c)] })) }))
  ]
});
