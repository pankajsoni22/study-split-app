import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { Excalidraw, fitSlide, sceneSignature, toStoredScene, type ExcalidrawImperativeAPI } from './excalidraw.ts';

type View = { scrollX: number; scrollY: number; zoom: number };
type Rect = { left: number; top: number; width: number; height: number };

const ZOOM_KEYS = new Set(['+', '=', '-', '_', '0']);
const isTyping = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement;

/**
 * Excalidraw locked to ONE slide (decided 2026-11-22): the slide is always shown whole; zoom and pan are
 * disabled (input blocked, and any drift snaps back). Drawing tools work as usual inside the slide.
 * `onSceneChange` fires only when elements really change, not on pointer moves or selection.
 */
export default function Canvas({ initialScene, slideId, onApi, onSceneChange }: {
  initialScene: CanvasScene;
  slideId: string | null;
  onApi?: (api: ExcalidrawImperativeAPI) => void;
  onSceneChange?: (scene: CanvasScene) => void;
}) {
  const theme = useResolvedTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const lastSig = useRef<number | null>(null);
  const locked = useRef<View | null>(null);
  const snapFrame = useRef(0);
  const [paper, setPaper] = useState<Rect | null>(null);

  const initialData = useMemo(() => ({
    elements: initialScene.elements as never,
    files: initialScene.files as never,
    appState: { viewBackgroundColor: 'transparent', currentItemFontFamily: 5 }
  }), [initialScene]);

  /** Fit the current slide, then remember that view as the locked one and place the paper sheet. */
  const fit = useCallback(() => {
    const a = apiRef.current;
    if (!a || !slideId) { locked.current = null; setPaper(null); return; }
    locked.current = null;
    fitSlide(a, slideId);
    requestAnimationFrame(() => {
      const st = a.getAppState();
      locked.current = { scrollX: st.scrollX, scrollY: st.scrollY, zoom: st.zoom.value };
      const frame = a.getSceneElements().find(e => e.id === slideId);
      if (frame) {
        const z = st.zoom.value;
        setPaper({ left: (frame.x + st.scrollX) * z, top: (frame.y + st.scrollY) * z, width: frame.width * z, height: frame.height * z });
      }
    });
  }, [slideId]);

  useEffect(() => { if (api) fit(); }, [api, fit]);

  // Refit when the pane changes size (layout switch, window resize).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(host);
    return () => ro.disconnect();
  }, [fit]);

  // Block zoom/pan input before Excalidraw sees it.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); };
    const onKey = (e: KeyboardEvent) => {
      const zoomKey = (e.ctrlKey || e.metaKey) && ZOOM_KEYS.has(e.key);
      const fitKey = e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3');
      const panKey = !isTyping(e.target) && !e.ctrlKey && !e.metaKey && (e.key === ' ' || e.key.toLowerCase() === 'h');
      if (zoomKey || fitKey || panKey) { e.preventDefault(); e.stopPropagation(); }
    };
    host.addEventListener('wheel', onWheel, { capture: true, passive: false });
    host.addEventListener('keydown', onKey, { capture: true });
    return () => { host.removeEventListener('wheel', onWheel, { capture: true }); host.removeEventListener('keydown', onKey, { capture: true }); };
  }, []);

  return (
    <div ref={hostRef} className="canvas-host dot-grid is-locked">
      {paper && <div className="slide-paper" style={paper} aria-hidden="true" />}
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={a => { apiRef.current = a; }}
        theme={theme}
        detectScroll={false}
        handleKeyboardGlobally={false}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: null, clearCanvas: false, changeViewBackgroundColor: false },
          tools: { image: true }
        }}
        onScrollChange={(scrollX, scrollY, zoom) => {
          // Safety net: anything that moved the camera (pinch, scrollbars, shortcuts we didn't catch) snaps back.
          const l = locked.current;
          if (!l) return;
          if (Math.abs(scrollX - l.scrollX) < 0.5 && Math.abs(scrollY - l.scrollY) < 0.5 && Math.abs(zoom.value - l.zoom) < 0.0005) return;
          cancelAnimationFrame(snapFrame.current);
          snapFrame.current = requestAnimationFrame(() => {
            apiRef.current?.updateScene({ appState: { scrollX: l.scrollX, scrollY: l.scrollY, zoom: { value: l.zoom as never } } });
          });
        }}
        onChange={(elements, appState, files) => {
          // Excalidraw hands out its API before initialData is applied; announce it after loading.
          if (appState.isLoading) return;
          const sig = sceneSignature(elements);
          if (lastSig.current === null) {
            lastSig.current = sig;
            if (!api && apiRef.current) { setApi(apiRef.current); onApi?.(apiRef.current); }
            return;
          }
          if (sig === lastSig.current || !onSceneChange) return;
          lastSig.current = sig;
          onSceneChange(toStoredScene(elements, files));
        }}
      />
    </div>
  );
}
