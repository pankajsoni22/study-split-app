// The only module that imports Excalidraw. It is loaded lazily (editor and reader routes only),
// so the home page never downloads it.
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  CaptureUpdateAction, convertToExcalidrawElements, exportToSvg, hashElementsVersion, newElementWith, restoreElements
} from '@excalidraw/excalidraw';
import { CURRENT_ITEM_KEY, reorder, restyle, selectionWithLabels, type El, type StyleKey, type StyleValue } from './format.ts';
import { SLIDE_GAP, type Layout } from '../../domain/layouts.ts';
import type { CanvasScene } from '../../domain/types.ts';

declare global {
  interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] }
}
// Fonts are served from our own origin (copied by scripts/copy-excalidraw-assets.mjs); the CSP blocks CDNs.
window.EXCALIDRAW_ASSET_PATH = new URL(`${import.meta.env.BASE_URL}excalidraw/`, window.location.origin).href;

export { Excalidraw } from '@excalidraw/excalidraw';
export type { ExcalidrawImperativeAPI };

type Element = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>[number];
type AnyElement = { id: string; type: string; isDeleted?: boolean; name?: string | null; x: number; y: number; width: number; height: number; fileId?: string | null; version: number };

export interface FrameInfo { id: string; name: string }

export function listFrames(elements: readonly unknown[]): FrameInfo[] {
  return (elements as AnyElement[])
    .filter(e => e.type === 'frame' && !e.isDeleted)
    .map((e, i) => ({ id: e.id, name: e.name || `Frame ${i + 1}` }));
}

/** Fit one slide in the pane (the camera is then locked there, see Canvas.tsx). */
export function fitSlide(api: ExcalidrawImperativeAPI, frameId: string) {
  const frame = api.getSceneElements().find(e => e.id === frameId);
  if (frame) api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: 0.9, animate: false });
}

/** Adds a slide (a named frame of the layout's size) after the existing ones and returns its id. */
export function createSlide(api: ExcalidrawImperativeAPI, name: string, layout: Layout): string {
  const frames = (api.getSceneElements() as unknown as AnyElement[]).filter(e => e.type === 'frame');
  const x = frames.length ? Math.max(...frames.map(f => f.x + f.width)) + SLIDE_GAP : 0;
  const [frame] = convertToExcalidrawElements([{ type: 'frame', children: [], name, x, y: 0, width: layout.slide.width, height: layout.slide.height }]);
  if (!frame) throw new Error('Could not create slide');
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), frame], captureUpdate: CaptureUpdateAction.NEVER });
  return frame.id;
}

/** Applies several frame changes (rename / resize) in one scene update. */
export function updateFrames(api: ExcalidrawImperativeAPI, changes: Map<string, { name?: string; width?: number; height?: number }>) {
  if (changes.size === 0) return;
  const elements = api.getSceneElementsIncludingDeleted().map(e => {
    const c = changes.get(e.id);
    if (!c || e.type !== 'frame') return e;
    return { ...e, ...c, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() };
  });
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
}

/** Frame size, for drawing the slide's aspect ratio. */
export function frameSize(scene: CanvasScene, frameId: string): { width: number; height: number } | null {
  const f = (scene.elements as AnyElement[]).find(e => e.id === frameId && e.type === 'frame');
  return f ? { width: f.width, height: f.height } : null;
}

/** True when a slide has anything drawn on it. */
export function slideHasContent(elements: readonly unknown[], frameId: string): boolean {
  return (elements as (AnyElement & { frameId?: string | null })[]).some(e => e.frameId === frameId && !e.isDeleted);
}

/** Scene to store: live elements + only the image files still referenced. */
export function toStoredScene(elements: readonly Element[], files: Record<string, unknown>): CanvasScene {
  const live = (elements as unknown as AnyElement[]).filter(e => !e.isDeleted);
  const used = new Set(live.map(e => e.fileId).filter(Boolean));
  return {
    elements: live,
    files: Object.fromEntries(Object.entries(files).filter(([id]) => used.has(id)))
  };
}

/** Cheap change detector: changes whenever any element changes. */
export const sceneSignature = (elements: readonly Element[]) => hashElementsVersion(elements);

/** SVG of one frame (Article mode, mobile). */
type ExportToSvg = (opts: {
  elements: readonly Element[]; files: never; exportPadding?: number; exportingFrame?: Element;
  appState: { exportBackground: boolean; exportWithDarkMode: boolean };
}) => Promise<SVGSVGElement>;

export function frameToSvg(scene: CanvasScene, frameId: string, dark: boolean): Promise<SVGSVGElement | null> {
  // restoreElements fills defaults/repairs bindings (same as Excalidraw does when loading), so older or
  // partial scenes export correctly.
  const elements = restoreElements(scene.elements as never, null, { repairBindings: true }) as unknown as Element[];
  const frame = elements.find(e => e.id === frameId);
  if (!frame || frame.type !== 'frame') return Promise.resolve(null);
  return (exportToSvg as unknown as ExportToSvg)({
    elements,
    files: scene.files as never,
    appState: { exportBackground: false, exportWithDarkMode: dark },
    exportingFrame: frame,
    exportPadding: 0
  });
}

// ---------------------------------------------------------------- Format bar (see format.ts)

const selectedIds = (api: ExcalidrawImperativeAPI) => api.getAppState().selectedElementIds as Record<string, boolean>;

/** Apply one style to the selection (and make it the default for new shapes). One undo step. */
export function applyStyle(api: ExcalidrawImperativeAPI, key: StyleKey, value: StyleValue) {
  const all = api.getSceneElementsIncludingDeleted();
  const patches = restyle(all, selectedIds(api), key, value);
  const texts: Element[] = [];
  const elements = all.map(e => {
    const patch = patches.get(e.id);
    if (!patch) return e;
    const next = newElementWith(e, patch as never);
    if (next.type === 'text' && (key === 'fontFamily' || key === 'fontSize')) texts.push(next);
    return next;
  });
  // Font changes change the text's size: let Excalidraw re-measure those elements.
  const remeasured = new Map(restoreElements(texts as never, null, { refreshDimensions: true }).map(e => [e.id, e]));
  api.updateScene({
    elements: remeasured.size ? elements.map(e => remeasured.get(e.id) ?? e) : elements,
    appState: { [CURRENT_ITEM_KEY[key]]: value } as never,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  });
}

export function moveSelection(api: ExcalidrawImperativeAPI, to: 'front' | 'back') {
  const all = api.getSceneElementsIncludingDeleted();
  api.updateScene({ elements: reorder(all as unknown as El[], selectedIds(api), to) as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}

export function deleteSelection(api: ExcalidrawImperativeAPI) {
  const all = api.getSceneElementsIncludingDeleted();
  const doomed = new Set(selectionWithLabels(all as unknown as El[], selectedIds(api)).map(e => e.id));
  api.updateScene({
    elements: all.map(e => (doomed.has(e.id) ? newElementWith(e, { isDeleted: true }) : e)),
    appState: { selectedElementIds: {} },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  });
}
