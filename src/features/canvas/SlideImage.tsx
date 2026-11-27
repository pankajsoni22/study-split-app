import { useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { nextSvgPrefix, scopeSvgFonts, scopeSvgIds, svgFontFamilies } from '../../lib/svgIds.ts';
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

  // Steady pictures (2026-11-27). A new picture (both Unfold layers) is built HIDDEN on top of the current one, shown
  // only once its own fonts are decoded, and the old one is removed in the same frame. Each copy's fonts have their
  // own names (scopeSvgFonts), so a new picture can never make text already on screen re-render or "wobble".
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    let cancelled = false;
    const frame = document.createElement('div');
    frame.className = 'slide-image-frame is-pending';
    Promise.all([renderSvg(scene, frameId, theme, stamp, baseKey), freshKey ? renderSvg(scene, frameId, theme, stamp, freshKey) : null])
      .then(async ([b, f]) => {
        if (cancelled) return;
        if (b === null) { setMissing(true); return; }
        const base = document.createElement('div');
        base.className = 'slide-image-svg';
        const families = show(base, b);
        frame.append(base);
        let freshLayer: HTMLDivElement | null = null;
        if (f) {
          freshLayer = document.createElement('div');
          freshLayer.className = 'slide-image-svg is-fresh';
          families.push(...show(freshLayer, f));
          frame.append(freshLayer);
        }
        stack.append(frame);
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
  }, [scene, frameId, theme, stamp, baseKey, freshKey]);

  if (missing || !size) return null;
  return (
    <div className={`slide-image ${className}`} role="img" aria-label={`Drawing: ${label}`}
      style={{ aspectRatio: `${size.width} / ${size.height}`, ['--ar' as string]: size.width / size.height }}>
      <div ref={stackRef} className="slide-image-stack" />
    </div>
  );
}

/** Waits (at most ~1.5 s) until these font families are decoded, so text never shows in a fallback font. */
function fontsReady(families: string[]): Promise<unknown> {
  if (!families.length || typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const loads = Promise.all(families.map(f => document.fonts.load(`20px "${f}"`).catch(() => [])));
  return Promise.race([loads, new Promise(resolve => window.setTimeout(resolve, 1500))]);
}

/** The SVG markup of a slide (or only some of its parts: comma-separated ids, '' = none, '*' = all), cached. */
function renderSvg(scene: CanvasScene, frameId: string, theme: string, stamp: number, onlyKey: string): Promise<string | null> {
  const key = `${frameId}:${theme}:${stamp}:${onlyKey}`;
  let perScene = cache.get(scene);
  if (!perScene) { perScene = new Map(); cache.set(scene, perScene); }
  const cached = perScene.get(key);
  if (cached) return Promise.resolve(cached);
  const ids = onlyKey === '*' ? undefined : new Set(onlyKey ? onlyKey.split(',') : []);
  return frameToSvg(scene, frameId, theme === 'dark', ids).then(svg => {
    if (!svg) return null;
    const markup = svg.outerHTML;
    perScene.set(key, markup);
    return markup;
  });
}

/** Our own Excalidraw export (no user HTML). Ids and fonts are scoped per copy: several pictures share this page.
 *  Returns the (scoped) font families the copy embeds. */
function show(host: HTMLDivElement, markup: string): string[] {
  const prefix = nextSvgPrefix();
  const scoped = scopeSvgFonts(scopeSvgIds(markup, prefix), prefix);
  host.innerHTML = scoped;
  const svg = host.querySelector('svg');
  if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-hidden', 'true'); }
  return svgFontFamilies(scoped);
}
