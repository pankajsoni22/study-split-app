import { Maximize } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  /** False from the moment this canvas starts unmounting: Excalidraw then swaps in an EMPTY scene, which must never
   *  be reported as the user's drawing. Layout cleanup runs before Excalidraw's own unmount. */
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const paperFrame = useRef(0);
  /** True once the user zoomed/panned since the last fit; pane resizes then keep their view. */
  const userMoved = useRef(false);
  const fitting = useRef(false);
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
    if (a && slideId) {
      fitting.current = true;
      fitSlide(a, slideId);
      requestAnimationFrame(() => { fitting.current = false; userMoved.current = false; });
    }
    placePaper();
  }, [placePaper, slideId]);

  useEffect(() => { if (api) fit(); }, [api, fit]);

  // Pane resized (auto layout, window): refit, unless the user has zoomed/panned to work on a detail.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => { if (userMoved.current) placePaper(); else fit(); });
    ro.observe(host);
    return () => ro.disconnect();
  }, [fit, placePaper]);

  // Keyboard (canvas focused, not typing in a text box):
  // - Shift+1 normally zooms to ALL content (every slide); here it fits the current slide instead.
  // - Tool shortcuts are letters only (decided 2026-11-22): number keys no longer switch tools, C = circle
  //   (ellipse; Excalidraw's O still works), F (new frame) is off because frames are managed as slides.
  //   All other letters are Excalidraw's own: V R D A L P T E H Q.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
        || (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const stop = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.shiftKey && e.code === 'Digit1') { stop(); fit(); return; }
      if (e.shiftKey) return;
      if (/^Digit[0-9]$/.test(e.code)) { stop(); return; }
      const key = e.key.toLowerCase();
      if (key === 'c') { stop(); apiRef.current?.setActiveTool({ type: 'ellipse' }); return; }
      if (key === 'f') stop();
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
        onScrollChange={() => { if (!fitting.current) userMoved.current = true; placePaper(); }}
        onChange={(elements, appState, files) => {
          // Excalidraw hands out its API before initialData is applied; announce it after loading.
          if (appState.isLoading || !alive.current) return;
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
