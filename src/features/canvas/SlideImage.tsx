import { useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { nextSvgPrefix, scopeSvgFonts, scopeSvgIds, svgFontFaces, svgFontFamilies } from '../../lib/svgIds.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { frameSize, frameToSvg } from './excalidraw.ts';

// Rendered slides, cached per scene object (a published scene never changes), theme and visible parts.
const cache = new WeakMap<CanvasScene, Map<string, string>>();

/**
 * One slide as a static picture on "paper" (readers, thumbnails, PDF). No Excalidraw UI, so there is
 * nothing to zoom or pan. `stamp` forces a re-render when the scene was edited (editor thumbnails).
 * Unfold: `only` limits the picture to these parts; `fresh` parts are drawn on a top layer that glows in.
 */
export default function SlideImage({ scene, frameId, label, stamp = 0, className = '', only, fresh }: {
  scene: CanvasScene; frameId: string; label: string; stamp?: number; className?: string;
  only?: ReadonlySet<string>; fresh?: ReadonlySet<string>;
}) {
  const theme = useResolvedTheme();
  const [missing, setMissing] = useState(false);
  const size = frameSize(scene, frameId);
  const base = only && fresh?.size ? new Set([...only].filter(id => !fresh.has(id))) : only;
  const baseKey = base ? [...base].sort().join(',') : '*';
  const freshKey = fresh?.size ? [...fresh].sort().join(',') : '';
  const stackRef = useRef<HTMLDivElement>(null);
  const fontsRef = useRef<HTMLDivElement>(null);
  /** Unfold: the split's fonts, declared ONCE (from a full export) under private names; step pictures carry none. */
  const shared = useRef<{ key: string; prefix: string; families: string[] } | null>(null);
  const unfolding = !!only;

  // Steady pictures (2026-11-27). A new picture (both Unfold layers) is built HIDDEN on top of the current one, shown
  // only once its own fonts are decoded, and the old one is removed in the same frame. Each copy's fonts have their
  // own names (scopeSvgFonts), so a new picture can never make text already on screen re-render or "wobble".
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    let cancelled = false;
    const frame = document.createElement('div');
    frame.className = 'slide-image-frame is-pending';
    const fontsKey = `${frameId}:${theme}:${stamp}`;
    Promise.all([
      renderSvg(scene, frameId, theme, stamp, baseKey, unfolding),
      freshKey ? renderSvg(scene, frameId, theme, stamp, freshKey, unfolding) : null,
      unfolding && shared.current?.key !== fontsKey ? renderSvg(scene, frameId, theme, stamp, '*') : null
    ])
      .then(async ([b, f, full]) => {
        if (cancelled) return;
        if (b === null) { setMissing(true); return; }
        const families: string[] = [];
        if (full && fontsRef.current) {
          // Declare the split's whole font set once (it covers every letter of every step).
          const prefix = nextSvgPrefix();
          const css = scopeSvgFonts(svgFontFaces(full), prefix);
          fontsRef.current.innerHTML = '';
          const style = document.createElement('style');
          style.textContent = css;
          fontsRef.current.append(style);
          shared.current = { key: fontsKey, prefix, families: svgFontFamilies(svgFontFaces(full)) };
          families.push(...svgFontFamilies(css));
        }
        const fonts = unfolding ? shared.current ?? undefined : undefined;
        const base = document.createElement('div');
        base.className = 'slide-image-svg';
        families.push(...show(base, b, fonts));
        frame.append(base);
        let freshLayer: HTMLDivElement | null = null;
        if (f) {
          freshLayer = document.createElement('div');
          freshLayer.className = 'slide-image-svg is-fresh';
          families.push(...show(freshLayer, f, fonts));
          frame.append(freshLayer);
        }
        stack.append(frame);
        void frame.offsetWidth;   // let the browser register the new @font-face rules
        await fontsReady(families);
        if (cancelled) return;
        for (const old of [...stack.children]) if (old !== frame) old.remove();
        frame.classList.remove('is-pending');
        freshLayer?.classList.add('is-glowing');
      }, () => { if (!cancelled) setMissing(true); });
    return () => {
      cancelled = true;
      if (frame.classList.contains('is-pending')) frame.remove();
    };
  }, [scene, frameId, theme, stamp, baseKey, freshKey, unfolding]);

  if (missing || !size) return null;
  return (
    <div className={`slide-image ${className}`} role="img" aria-label={`Drawing: ${label}`}
      style={{ aspectRatio: `${size.width} / ${size.height}`, ['--ar' as string]: size.width / size.height }}>
      <div ref={fontsRef} hidden />
      <div ref={stackRef} className="slide-image-stack" />
    </div>
  );
}

/**
 * Waits (at most ~1.5 s) until these font families are decoded, so text never shows in a fallback font. Waits for
 * the actual FontFace objects: right after the picture is inserted the browser may not have registered its
 * @font-face rules yet, and asking by name then resolves at once (that let a picture show early when stepping back).
 */
function fontsReady(families: string[]): Promise<unknown> {
  if (!families.length || typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const plain = (f: string) => f.replace(/["']/g, '');
  const facesFor = () => [...document.fonts].filter(f => families.includes(plain(f.family)));
  const load = async () => {
    for (let tries = 0; tries < 10; tries++) {
      const faces = facesFor();
      if (families.every(fam => faces.some(f => plain(f.family) === fam))) {
        await Promise.all(faces.map(f => f.load().catch(() => f)));
        return;
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  };
  return Promise.race([load(), new Promise(resolve => window.setTimeout(resolve, 1500))]);
}

/** The SVG markup of a slide (or only some of its parts: comma-separated ids, '' = none, '*' = all), cached. */
function renderSvg(scene: CanvasScene, frameId: string, theme: string, stamp: number, onlyKey: string, noFonts = false): Promise<string | null> {
  const key = `${frameId}:${theme}:${stamp}:${onlyKey}${noFonts ? ':nofonts' : ''}`;
  let perScene = cache.get(scene);
  if (!perScene) { perScene = new Map(); cache.set(scene, perScene); }
  const cached = perScene.get(key);
  if (cached) return Promise.resolve(cached);
  const ids = onlyKey === '*' ? undefined : new Set(onlyKey ? onlyKey.split(',') : []);
  return frameToSvg(scene, frameId, theme === 'dark', ids, noFonts).then(svg => {
    if (!svg) return null;
    const markup = svg.outerHTML;
    perScene.set(key, markup);
    return markup;
  });
}

/** Our own Excalidraw export (no user HTML). Ids and fonts are scoped per copy: several pictures share this page.
 *  Returns the (scoped) font families the copy embeds. */
function show(host: HTMLDivElement, markup: string, fonts?: { prefix: string; families: string[] }): string[] {
  const prefix = nextSvgPrefix();
  // With shared fonts (Unfold) the text points at the split's fonts declared once; otherwise at the copy's own.
  const scoped = fonts
    ? scopeSvgFonts(scopeSvgIds(markup, prefix), fonts.prefix, fonts.families)
    : scopeSvgFonts(scopeSvgIds(markup, prefix), prefix);
  host.innerHTML = scoped;
  const svg = host.querySelector('svg');
  if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-hidden', 'true'); }
  return svgFontFamilies(scoped);
}
