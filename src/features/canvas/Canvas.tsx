import { useMemo, useRef } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { Excalidraw, sceneSignature, toStoredScene, type ExcalidrawImperativeAPI } from './excalidraw.ts';

/**
 * Excalidraw wrapper. `onSceneChange` fires only when elements really change (not on every pointer
 * move or selection), so typing in the editor and panning the canvas never mark the draft dirty.
 */
export default function Canvas({ initialScene, viewMode = false, onApi, onSceneChange }: {
  initialScene: CanvasScene;
  viewMode?: boolean;
  onApi?: (api: ExcalidrawImperativeAPI) => void;
  onSceneChange?: (scene: CanvasScene) => void;
}) {
  const theme = useResolvedTheme();
  const lastSig = useRef<number | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const announced = useRef(false);
  // Excalidraw reads initialData once; keep the object stable across re-renders.
  const initialData = useMemo(() => ({
    elements: initialScene.elements as never,
    files: initialScene.files as never,
    appState: { viewBackgroundColor: 'transparent', currentItemFontFamily: 5 }
  }), [initialScene]);

  return (
    <div className={`canvas-host dot-grid${viewMode ? ' is-view' : ''}`}>
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={api => { apiRef.current = api; }}
        theme={theme}
        viewModeEnabled={viewMode}
        zenModeEnabled={viewMode}
        detectScroll={false}
        handleKeyboardGlobally={false}
        UIOptions={{
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: null, clearCanvas: !viewMode, changeViewBackgroundColor: false },
          tools: { image: !viewMode }
        }}
        onChange={(elements, appState, files) => {
          // Excalidraw hands out its API before initialData is applied; anything done earlier (e.g. creating
          // template frames) would be overwritten. So the API is announced on the first change after loading.
          if (appState.isLoading) return;
          const sig = sceneSignature(elements);
          if (lastSig.current === null) {
            lastSig.current = sig;                    // the loaded scene, not a user change
            if (!announced.current && apiRef.current) { announced.current = true; onApi?.(apiRef.current); }
            return;
          }
          if (!onSceneChange) return;
          if (sig === lastSig.current) return;
          lastSig.current = sig;
          onSceneChange(toStoredScene(elements, files));
        }}
      />
    </div>
  );
}
