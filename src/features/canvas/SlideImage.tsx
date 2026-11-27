import { useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { nextSvgPrefix, scopeSvgIds } from '../../lib/svgIds.ts';
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
  const baseRef = useRef<HTMLDivElement>(null);
  const freshRef = useRef<HTMLDivElement>(null);

  // Both layers are rendered first and swapped in together (2026-11-27): replacing them one at a time made the
  // previous step's parts vanish for a moment while the new pictures were still being drawn (an Unfold "flicker").
  useEffect(() => {
    let cancelled = false;
    Promise.all([renderSvg(scene, frameId, theme, stamp, baseKey), freshKey ? renderSvg(scene, frameId, theme, stamp, freshKey) : null])
      .then(([b, f]) => {
        if (cancelled) return;
        if (b === null) { setMissing(true); return; }
        show(baseRef.current, b);
        const layer = freshRef.current;
        if (!layer) return;
        if (!f) { layer.innerHTML = ''; layer.classList.remove('is-glowing'); return; }
        show(layer, f);
        layer.classList.remove('is-glowing');
        void layer.offsetWidth;   // restart the glow for the new parts
        layer.classList.add('is-glowing');
      }, () => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [scene, frameId, theme, stamp, baseKey, freshKey]);

  if (missing || !size) return null;
  return (
    <div className={`slide-image ${className}`} role="img" aria-label={`Drawing: ${label}`}
      style={{ aspectRatio: `${size.width} / ${size.height}`, ['--ar' as string]: size.width / size.height }}>
      <div ref={baseRef} className="slide-image-svg" />
      <div ref={freshRef} className="slide-image-svg is-fresh" />
    </div>
  );
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

/** Our own Excalidraw export (no user HTML). Ids are scoped per copy: several slides share this page. */
function show(host: HTMLDivElement | null, markup: string) {
  if (!host) return;
  host.innerHTML = scopeSvgIds(markup, nextSvgPrefix());
  const svg = host.querySelector('svg');
  if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-hidden', 'true'); }
}
