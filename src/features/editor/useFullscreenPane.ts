import { useCallback, useEffect, useRef, useState } from 'react';

export type FullscreenPane = 'text' | 'canvas' | null;

/**
 * Full screen for one side of the editor (decided 2026-11-24): that side fills the window and the browser goes
 * full screen. If the browser refuses (permissions, iframe), the side still fills the window. Esc or the exit
 * button returns to the split view.
 */
export function useFullscreenPane() {
  const [pane, setPane] = useState<FullscreenPane>(null);
  const usingBrowserFs = useRef(false);

  const exit = useCallback(() => {
    setPane(null);
    if (usingBrowserFs.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    usingBrowserFs.current = false;
  }, []);

  const enter = useCallback((which: Exclude<FullscreenPane, null>) => {
    setPane(which);
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(() => { usingBrowserFs.current = true; }, () => { usingBrowserFs.current = false; });
    }
  }, []);

  const toggle = useCallback((which: Exclude<FullscreenPane, null>) => {
    if (pane === which) exit();
    else enter(which);
  }, [enter, exit, pane]);

  // Leaving browser full screen (Esc, F11) also leaves the pane focus.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && usingBrowserFs.current) { usingBrowserFs.current = false; setPane(null); }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Esc returns to the split view (browsers also leave their own full screen on Esc). Not while typing a label in a
  // drawing, or when a dialog or menu is using Esc itself.
  useEffect(() => {
    if (!pane) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('textarea, input, select, [role="dialog"], [role="menu"]')) return;
      exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, pane]);

  // Leave browser full screen when the editor closes.
  useEffect(() => () => { if (usingBrowserFs.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {}); }, []);

  return { pane, enter, exit, toggle };
}
