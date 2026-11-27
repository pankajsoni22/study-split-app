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
export default function Canvas({ initialScene, slideId, showNativeProps = false, onApi, onSceneChange, spotlight, onSelectStep }: {
  initialScene: CanvasScene;
  slideId: string | null;
  /** Show Excalidraw's own properties panel (normally replaced by the Study Split format bar). */
  showNativeProps?: boolean;
  onApi?: (api: ExcalidrawImperativeAPI) => void;
  onSceneChange?: (scene: CanvasScene) => void;
  /** Unfold: glow on the drawing parts of this paragraph; `fade` also dims the rest of the split (display only). */
  spotlight?: { blockId: string | null; fade: boolean } | null;
  /** Unfold: the paragraph the selected drawing parts belong to (null: none, or parts of several paragraphs). */
  onSelectStep?: (blockId: string | null) => void;
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
  /** Unfold spotlight: on-screen boxes of the current paragraph's drawing parts. */
  const [spotBoxes, setSpotBoxes] = useState<Rect[]>([]);
  const spotFrame = useRef(0);
  const spotRef = useRef(spotlight);
  useEffect(() => { spotRef.current = spotlight; });
  const placeSpot = useCallback(() => {
    cancelAnimationFrame(spotFrame.current);
    spotFrame.current = requestAnimationFrame(() => {
      const a = apiRef.current, id = spotRef.current?.blockId;
      if (!a || !id) { setSpotBoxes(b => (b.length ? [] : b)); return; }
      const st = a.getAppState(), z = st.zoom.value;
      const els = a.getSceneElements() as unknown as SpotEl[];
      const own = new Set(els.filter(e => e.customData?.unfold === id).map(e => e.id));
      const boxes = els.filter(e => own.has(e.id) || (e.containerId && own.has(e.containerId)))
        .map(e => { const b = sceneBounds(e); const pad = 5; return { left: (b.x1 + st.scrollX) * z - pad, top: (b.y1 + st.scrollY) * z - pad, width: (b.x2 - b.x1) * z + pad * 2, height: (b.y2 - b.y1) * z + pad * 2 }; });
      const merged = mergeTouching(boxes);
      setSpotBoxes(prev => (JSON.stringify(prev) === JSON.stringify(merged) ? prev : merged));
    });
  }, []);
  useEffect(() => { placeSpot(); }, [placeSpot, spotlight?.blockId, api]);
  useEffect(() => () => cancelAnimationFrame(spotFrame.current), []);
  /** Reverse link: which paragraph the selected parts belong to. */
  const lastPicked = useRef<string | null | undefined>(undefined);
  const onSelectStepRef = useRef(onSelectStep);
  useEffect(() => { onSelectStepRef.current = onSelectStep; });

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
      {spotlight?.blockId && spotBoxes.length > 0 && (
        <svg className={`unfold-spotlight${spotlight.fade ? ' is-fading' : ''}`} aria-hidden="true">
          {spotlight.fade && paper && (
            <>
              <defs>
                <mask id="unfold-spot-mask">
                  <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
                  {spotBoxes.map((b, i) => <rect key={i} x={b.left} y={b.top} width={b.width} height={b.height} rx="8" fill="#000" />)}
                </mask>
              </defs>
              <rect className="unfold-veil" x={paper.left} y={paper.top} width={paper.width} height={paper.height} mask="url(#unfold-spot-mask)" />
            </>
          )}
          {spotBoxes.map((b, i) => <rect key={i} className="unfold-glow" x={b.left} y={b.top} width={b.width} height={b.height} rx="8" />)}
        </svg>
      )}
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
        onScrollChange={() => { if (!fitting.current) userMoved.current = true; placePaper(); placeSpot(); }}
        onChange={(elements, appState, files) => {
          // Excalidraw hands out its API before initialData is applied; announce it after loading.
          if (appState.isLoading || !alive.current) return;
          if (spotRef.current?.blockId) placeSpot();
          if (onSelectStepRef.current) {
            const picked = stepOfSelection(elements as unknown as SpotEl[], appState.selectedElementIds);
            if (picked !== lastPicked.current) { lastPicked.current = picked; onSelectStepRef.current(picked); }
          }
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

// ---- Unfold spotlight helpers ----
interface SpotEl { id: string; type: string; x: number; y: number; width: number; height: number; angle?: number; isDeleted?: boolean;
  points?: readonly (readonly [number, number])[]; containerId?: string | null; customData?: Record<string, unknown> }

/** Axis-aligned scene box of an element (lines/arrows by their points; rotation taken into account). */
function sceneBounds(e: SpotEl): { x1: number; y1: number; x2: number; y2: number } {
  const pts: [number, number][] = e.points?.length
    ? e.points.map(([px, py]) => [e.x + px, e.y + py])
    : [[e.x, e.y], [e.x + e.width, e.y], [e.x + e.width, e.y + e.height], [e.x, e.y + e.height]];
  const xs0 = pts.map(p => p[0]), ys0 = pts.map(p => p[1]);
  const cx = (Math.min(...xs0) + Math.max(...xs0)) / 2, cy = (Math.min(...ys0) + Math.max(...ys0)) / 2;
  const a = e.angle ?? 0, cos = Math.cos(a), sin = Math.sin(a);
  const rot = a ? pts.map(([x, y]) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos]) : pts;
  const xs = rot.map(p => p[0]!), ys = rot.map(p => p[1]!);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

/** The one paragraph all selected parts belong to (a shape's label counts as the shape); null if none or several. */
function stepOfSelection(elements: SpotEl[], selected: Record<string, boolean>): string | null {
  const byId = new Map(elements.map(e => [e.id, e]));
  const tags = new Set<string | null>();
  for (const [id, on] of Object.entries(selected)) {
    if (!on) continue;
    let e = byId.get(id);
    if (!e || e.isDeleted || e.type === 'frame') continue;
    if (e.containerId) e = byId.get(e.containerId) ?? e;
    tags.add((e.customData?.unfold as string | undefined) ?? null);
  }
  return tags.size === 1 ? [...tags][0]! : null;
}

/** Overlapping / touching boxes become one (a table glows as one box; separate parts keep their own). */
function mergeTouching(boxes: Rect[]): Rect[] {
  const out = boxes.map(b => ({ ...b }));
  const touch = (a: Rect, b: Rect) => a.left <= b.left + b.width + 2 && b.left <= a.left + a.width + 2 && a.top <= b.top + b.height + 2 && b.top <= a.top + a.height + 2;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!, b = out[j]!;
      if (!touch(a, b)) continue;
      const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
      out[i] = { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
      out.splice(j, 1); changed = true; break;
    }
  }
  return out.map(b => ({ left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) }));
}
