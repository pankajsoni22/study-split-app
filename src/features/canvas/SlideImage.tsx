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
  const freshKey = fresh?.size ? [...fresh].sort().join(',') : '';

  if (missing || !size) return null;
  return (
    <div className={`slide-image ${className}`} role="img" aria-label={`Drawing: ${label}`}
      style={{ aspectRatio: `${size.width} / ${size.height}`, ['--ar' as string]: size.width / size.height }}>
      <SvgLayer scene={scene} frameId={frameId} theme={theme} stamp={stamp} only={base} onMissing={() => setMissing(true)} />
      {freshKey && <SvgLayer key={freshKey} scene={scene} frameId={frameId} theme={theme} stamp={stamp} only={fresh} className="is-fresh" />}
    </div>
  );
}

function SvgLayer({ scene, frameId, theme, stamp, only, className = '', onMissing }: {
  scene: CanvasScene; frameId: string; theme: string; stamp: number; only?: ReadonlySet<string>; className?: string; onMissing?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onlyKey = only ? [...only].sort().join(',') : '*';
  const missingRef = useRef(onMissing);
  useEffect(() => { missingRef.current = onMissing; });

  useEffect(() => {
    let cancelled = false;
    const key = `${frameId}:${theme}:${stamp}:${onlyKey}`;
    let perScene = cache.get(scene);
    if (!perScene) { perScene = new Map(); cache.set(scene, perScene); }
    const cached = perScene.get(key);
    const show = (markup: string) => {
      const host = ref.current;
      if (cancelled || !host) return;
      // Our own Excalidraw export (no user HTML). Ids are scoped per copy: several slides share this page.
      host.innerHTML = scopeSvgIds(markup, nextSvgPrefix());
      const svg = host.querySelector('svg');
      if (svg) { svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('aria-hidden', 'true'); }
    };
    if (cached) { show(cached); return; }
    const ids = onlyKey === '*' ? undefined : new Set(onlyKey ? onlyKey.split(',') : []);
    frameToSvg(scene, frameId, theme === 'dark', ids).then(svg => {
      if (!svg) { if (!cancelled) missingRef.current?.(); return; }
      const markup = svg.outerHTML;
      perScene.set(key, markup);
      show(markup);
    }, () => { if (!cancelled) missingRef.current?.(); });
    return () => { cancelled = true; };
  }, [scene, frameId, theme, stamp, onlyKey]);

  return <div ref={ref} className={`slide-image-svg ${className}`} />;
}
