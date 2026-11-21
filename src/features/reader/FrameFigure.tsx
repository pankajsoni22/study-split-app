import { Maximize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { frameToSvg } from '../canvas/excalidraw.ts';

/** A section's frame as an inline SVG (Article mode, phones). */
export default function FrameFigure({ scene, frameId, caption, onOpen }: {
  scene: CanvasScene; frameId: string; caption: string; onOpen?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useResolvedTheme();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    frameToSvg(scene, frameId, theme === 'dark').then(svg => {
      const host = ref.current;
      if (cancelled || !host) return;
      host.replaceChildren();
      if (!svg) { setFailed(true); return; }
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Diagram: ${caption}`);
      host.appendChild(svg);
    }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [scene, frameId, theme, caption]);

  if (failed) return null;
  return (
    <figure className="frame-figure">
      <div ref={ref} className="frame-figure-svg dot-grid" />
      <figcaption>
        <span>{caption}</span>
        {onOpen && <button type="button" className="link-button" onClick={onOpen}><Maximize2 size={14} aria-hidden="true" /> Open beside the text</button>}
      </figcaption>
    </figure>
  );
}
