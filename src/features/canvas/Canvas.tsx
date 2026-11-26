import { Maximize } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { Excalidraw, fitSlide, sceneSignature, toStoredScene, type ExcalidrawImperativeAPI } from './excalidraw.ts';

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Excalidraw focused on ONE slide: switching slides (or resizing the pane) fits that slide to the pane.
 * Zoom and pan work normally while drawing (revised 2026-11-22: a fully locked canvas was uncomfortable);
 * "Fit split" or Shift+1 brings the whole drawing back. Readers still see slides as fixed pictures.
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
    let frame = 0;
    const ro = new ResizeObserver(() => {
      // Decide now (Excalidraw's own resize handling may scroll), then wait until Excalidraw has taken the new size,
      // otherwise the fit uses the old width (e.g. entering full screen left the slide in the corner).
      const keepView = userMoved.current;
      let tries = 0;
      cancelAnimationFrame(frame);
      const step = () => {
        const a = apiRef.current;
        if (a && Math.abs(a.getAppState().width - host.clientWidth) > 1 && tries++ < 20) { frame = requestAnimationFrame(step); return; }
        if (keepView) placePaper(); else fit();
      };
      frame = requestAnimationFrame(step);
    });
    ro.observe(host);
    return () => { ro.disconnect(); cancelAnimationFrame(frame); };
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

  // Double-click inside an UNFILLED rectangle / ellipse / diamond adds (or edits) its centred label, exactly like a
  // filled one (decided 2026-11-26). Excalidraw only "hits" an unfilled shape on its outline, so a double-click in
  // its empty middle used to create a loose text at the cursor that didn't move with the shape. We select the shape
  // and send Enter, which is Excalidraw's own "edit this shape's label" action (centred, bound to the shape).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onDblClick = (e: MouseEvent) => {
      const api = apiRef.current;
      if (!api || !(e.target instanceof HTMLCanvasElement)) return;
      const st = api.getAppState();
      if (st.activeTool.type !== 'selection' || st.editingTextElement) return;
      const z = st.zoom.value;
      const x = (e.clientX - st.offsetLeft) / z - st.scrollX, y = (e.clientY - st.offsetTop) / z - st.scrollY;
      const hit = topmostAt(api.getSceneElements() as unknown as ShapeLike[], x, y);
      if (!hit || !LABELLED.has(hit.type) || (hit.backgroundColor && hit.backgroundColor !== 'transparent')) return;
      e.preventDefault();
      e.stopPropagation();
      api.updateScene({ appState: { selectedElementIds: { [hit.id]: true }, selectedGroupIds: {}, editingGroupId: null } as never });
      requestAnimationFrame(() => {
        host.querySelector('.excalidraw')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      });
    };
    host.addEventListener('dblclick', onDblClick, { capture: true });
    return () => host.removeEventListener('dblclick', onDblClick, { capture: true });
  }, []);

  return (
    <div ref={hostRef} className={`canvas-host dot-grid is-slide${showNativeProps ? ' show-native-props' : ''}`}>
      {paper && <div className="slide-paper" style={paper} aria-hidden="true" />}
      {slideId && (
        <button type="button" className="btn btn-ghost btn-sm fit-slide" onClick={fit} title="Show this split's whole drawing (Shift+1)">
          <Maximize size={14} aria-hidden="true" /> Fit split
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

// ---- label-on-double-click helpers ----
interface ShapeLike { id: string; type: string; x: number; y: number; width: number; height: number; angle?: number; isDeleted?: boolean; backgroundColor?: string; frameId?: string | null }
const LABELLED = new Set(['rectangle', 'ellipse', 'diamond']);
/** Thin strokes: their bounding box would wrongly "cover" a shape they cross. */
const THIN = new Set(['arrow', 'line', 'freedraw']);

/** The topmost element under a scene point (frames and thin strokes ignored). Shapes count anywhere inside, text and images by box. */
function topmostAt(elements: ShapeLike[], px: number, py: number): ShapeLike | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (el.isDeleted || el.type === 'frame' || THIN.has(el.type)) continue;
    // rotate the point into the element's own (unrotated) space
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2, a = -(el.angle ?? 0);
    const dx = (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a), dy = (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a);
    const rx = Math.abs(el.width) / 2, ry = Math.abs(el.height) / 2;
    if (rx < 1 || ry < 1) continue;
    const inside = el.type === 'ellipse' ? (dx / rx) ** 2 + (dy / ry) ** 2 <= 1
      : el.type === 'diamond' ? Math.abs(dx) / rx + Math.abs(dy) / ry <= 1
      : Math.abs(dx) <= rx && Math.abs(dy) <= ry;
    if (inside) return el;
  }
  return null;
}
