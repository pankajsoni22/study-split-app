import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutId } from '../../domain/layouts.ts';
import { readJson, writeJson } from '../../lib/storage.ts';

const AUTO_KEY = 'ss.editor.autoLayout';
export const WRITE_LAYOUT: LayoutId = '60-40';
export const DRAW_LAYOUT: LayoutId = '40-60';

/**
 * The editor's on-screen split, separate from the article layout (which sets slide shape and the readers'
 * default). With Auto on, writing gives the text more room (60:40) and drawing gives the canvas more room
 * (40:60). Every automatic switch is announced on the divider, so it never feels random.
 */
export function useEditorView() {
  const [auto, setAuto] = useState<boolean>(() => readJson(AUTO_KEY, true));
  const [view, setView] = useState<LayoutId | null>(null);   // null = follow the article layout
  const [notice, setNotice] = useState<string | null>(null);
  const viewRef = useRef<LayoutId | null>(null);
  const autoRef = useRef(auto);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { autoRef.current = auto; viewRef.current = view; });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const announce = useCallback((text: string) => {
    setNotice(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 1600);
  }, []);

  /** Called when the user starts writing or drawing. */
  const activity = useCallback((kind: 'write' | 'draw') => {
    if (!autoRef.current) return;
    const target = kind === 'draw' ? DRAW_LAYOUT : WRITE_LAYOUT;
    if (viewRef.current === target) return;
    viewRef.current = target;
    setView(target);
    announce(kind === 'draw' ? 'Drawing · 40 : 60' : 'Writing · 60 : 40');
  }, [announce]);

  /** A layout picked by hand (picker or divider) wins: Auto turns off. */
  const pick = useCallback((id: LayoutId) => {
    viewRef.current = id;
    setView(id);
    if (autoRef.current) {
      autoRef.current = false;
      setAuto(false);
      writeJson(AUTO_KEY, false);
      announce('Auto layout off');
    }
  }, [announce]);

  const toggleAuto = useCallback(() => {
    const next = !autoRef.current;
    autoRef.current = next;
    setAuto(next);
    writeJson(AUTO_KEY, next);
    announce(next ? 'Auto layout on' : 'Auto layout off');
  }, [announce]);

  return { auto, view, notice, activity, pick, toggleAuto };
}
