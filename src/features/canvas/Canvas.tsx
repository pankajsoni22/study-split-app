import { Maximize } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { Excalidraw, fitSlide, sceneSignature, toStoredScene, type ExcalidrawImperativeAPI } from './excalidraw.ts';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Excalidraw focused on ONE slide: switching slides (or resizing the pane) fits that slide to the pane.
 * Zoom and pan work normally while drawing (revised 2026-11-22: a fully locked canvas was uncomfortable);
 * "Fit slide" or Shift+1 brings the whole slide back. Readers still see slides as fixed pictures.
 * `onSceneChange` fires only when elements really change, not on pointer moves or selection.
 */
export default function Canvas({ initialScene, slideId, showNativeProps = false, onApi, onSceneChange }: {
  initialScene: CanvasScene;
  slideId: string | null;
  /** Show Excalidraw's own properties panel (normally replaced by the Study Split format bar). */
  showNativeProps?: boolean;
  onApi?: (api: ExcalidrawImperativeAPI) => void;
  onSceneChange?: (scene: CanvasScene) => void;
}) {
  const theme = useResolvedTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const lastSig = useRef<number | null>(null);
  const paperFrame = useRef(0);
  const [paper, setPaper] = useState<Rect | null>(null);

  const initialData = useMemo(() => ({
    elements: initialScene.elements as never,
    files: initialScene.files as never,
    appState: { viewBackgroundColor: 'transparent', currentItemFontFamily: 5 }
  }), [initialScene]);

  /** Keep the "paper" sheet under the slide as the view zooms and pans. */
  const placePaper = useCallback(() => {
    cancelAnimationFrame(paperFrame.current);
    paperFrame.current = requestAnimationFrame(() => {
      const a = apiRef.current;
      const frame = a && slideId ? a.getSceneElements().find(e => e.id === slideId) : null;
      if (!a || !frame) { setPaper(null); return; }
      const st = a.getAppState();
      const z = st.zoom.value;
      setPaper({ left: (frame.x + st.scrollX) * z, top: (frame.y + st.scrollY) * z, width: frame.width * z, height: frame.height * z });
    });
  }, [slideId]);

  /** Show the whole current slide. */
  const fit = useCallback(() => {
    const a = apiRef.current;
    if (a && slideId) fitSlide(a, slideId);
    placePaper();
  }, [placePaper, slideId]);

  useEffect(() => { if (api) fit(); }, [api, fit]);

  // Refit when the pane changes size (layout switch, window resize).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(host);
    return () => ro.disconnect();
  }, [fit]);

  // Shift+1 normally zooms to ALL content (every slide); here it fits the current slide instead.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Digit1' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault(); e.stopPropagation(); fit();
      }
    };
    host.addEventListener('keydown', onKey, { capture: true });
    return () => host.removeEventListener('keydown', onKey, { capture: true });
  }, [fit]);

  return (
    <div ref={hostRef} className={`canvas-host dot-grid is-slide${showNativeProps ? ' show-native-props' : ''}`}>
      {paper && <div className="slide-paper" style={paper} aria-hidden="true" />}
      {slideId && (
        <button type="button" className="btn btn-ghost btn-sm fit-slide" onClick={fit} title="Show the whole slide (Shift+1)">
          <Maximize size={14} aria-hidden="true" /> Fit slide
        </button>
      )}
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
        onScrollChange={placePaper}
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
