// The only module that imports Excalidraw. It is loaded lazily (editor and reader routes only),
// so the home page never downloads it.
import '@excalidraw/excalidraw/index.css';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import {
  CaptureUpdateAction, convertToExcalidrawElements, exportToSvg, hashElementsVersion
} from '@excalidraw/excalidraw';
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

const FRAME_W = 720;
const FRAME_H = 460;
const GAP = 120;

export function listFrames(elements: readonly unknown[]): FrameInfo[] {
  return (elements as AnyElement[])
    .filter(e => e.type === 'frame' && !e.isDeleted)
    .map((e, i) => ({ id: e.id, name: e.name || `Frame ${i + 1}` }));
}

/** Fly the camera to a frame (docs §4: 450 ms glide). No-op if the frame is gone. */
export function scrollToFrame(api: ExcalidrawImperativeAPI, frameId: string, animate = true) {
  const frame = api.getSceneElements().find(e => e.id === frameId);
  if (frame) api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: 0.9, animate, duration: 450 });
}

/** Adds a named, empty frame to the right of the existing ones and returns its id. */
export function createFrame(api: ExcalidrawImperativeAPI, name: string): string {
  const existing = api.getSceneElements() as unknown as AnyElement[];
  const frames = existing.filter(e => e.type === 'frame');
  const x = frames.length ? Math.max(...frames.map(f => f.x + f.width)) + GAP : 0;
  const y = frames.length ? Math.min(...frames.map(f => f.y)) : 0;
  const [frame] = convertToExcalidrawElements([{ type: 'frame', children: [], name, x, y, width: FRAME_W, height: FRAME_H }]);
  if (!frame) throw new Error('Could not create frame');
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), frame], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return frame.id;
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
  const elements = scene.elements as Element[];
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
