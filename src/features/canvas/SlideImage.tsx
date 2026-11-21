import { useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { frameSize, frameToSvg } from './excalidraw.ts';

// Rendered slides, cached per scene object (a published scene never changes) and theme.
const cache = new WeakMap<CanvasScene, Map<string, string>>();

/**
 * One slide as a static picture on "paper" (readers, thumbnails, PDF). No Excalidraw UI, so there is
 * nothing to zoom or pan. `stamp` forces a re-render when the scene was edited (editor thumbnails).
 */
export default function SlideImage({ scene, frameId, label, stamp = 0, className = '' }: {
  scene: CanvasScene; frameId: string; label: string; stamp?: number; className?: string;
}) {
  const theme = useResolvedTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [missing, setMissing] = useState(false);
  const size = frameSize(scene, frameId);

  useEffect(() => {
    let cancelled = false;
    const key = `${frameId}:${theme}:${stamp}`;
    let perScene = cache.get(scene);
    if (!perScene) { perScene = new Map(); cache.set(scene, perScene); }
    const cached = perScene.get(key);
    const show = (markup: string) => {
      const host = ref.current;
      if (cancelled || !host) return;
      host.innerHTML = markup;           // our own Excalidraw export (no user HTML)
      const svg = host.querySelector('svg');
      if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-hidden', 'true'); }
    };
    if (cached) { show(cached); return; }
    frameToSvg(scene, frameId, theme === 'dark').then(svg => {
      if (!svg) { if (!cancelled) setMissing(true); return; }
      const markup = svg.outerHTML;
      perScene.set(key, markup);
      show(markup);
    }, () => { if (!cancelled) setMissing(true); });
    return () => { cancelled = true; };
  }, [scene, frameId, theme, stamp]);

  if (missing || !size) return null;
  return (
    <div className={`slide-image ${className}`} role="img" aria-label={`Slide: ${label}`}
      style={{ aspectRatio: `${size.width} / ${size.height}`, ['--ar' as string]: size.width / size.height }}>
      <div ref={ref} className="slide-image-svg" />
    </div>
  );
}
