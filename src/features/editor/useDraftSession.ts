import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureSectionIds, readingMinutes, type Doc } from '../../domain/content.ts';
import { slugify } from '../../domain/slug.ts';
import type { ArticleDraft, ArticleMeta, CanvasScene } from '../../domain/types.ts';
import { AppError, errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import { localDrafts } from '../../lib/localDrafts.ts';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

export function useDraftSession(articleId: string) {
  const services = getServices();
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  /** Bumped when content is replaced from outside (discard / reload) so editor + canvas remount. */
  const [sessionKey, setSessionKey] = useState(0);
  const [meta, setMetaState] = useState<ArticleMeta | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<ArticleDraft['status']>('draft');
  const [publishing, setPublishing] = useState(false);
  /** The editor opened unsaved work from this device (shown next to "Unsaved changes"). */
  const [fromDevice, setFromDevice] = useState(false);
  /** Draft version saved on the server, and the draft version readers see (for "anything new to publish?"). */
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [publishedDraftVersion, setPublishedDraftVersion] = useState<number | null>(null);

  const docRef = useRef<Doc | null>(null);
  const canvasRef = useRef<CanvasScene | null>(null);
  const metaRef = useRef<ArticleMeta | null>(null);
  const versionRef = useRef(0);
  const changeCount = useRef(0);
  const savingRef = useRef(false);
  const slugTouched = useRef(false);
  const autosaveTimer = useRef<number | undefined>(undefined);
  /** Mirrors sessionKey but changes synchronously, so late events from a torn-down editor/canvas can be ignored. */
  const sessionRef = useRef(0);
  // ---- load (1 DB call) + local copy check ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [d, local] = await Promise.all([services.articles.getDraft(articleId), localDrafts.get(articleId)]);
      if (cancelled) return;
      if (!d) { setLoadError(new AppError('NOT_FOUND', 'Article not found, or you cannot edit it.')); return; }
      // Unsaved work on this device (decided 2026-11-24): no "Restore" prompt. If it is newer than the server copy,
      // the editor simply opens it, marked unsaved. Its base version is kept, so if the server changed elsewhere in
      // the meantime, saving shows the usual conflict choice instead of overwriting.
      const useLocal = !!local && !d.deletedAt && local.savedAt > Date.parse(d.updatedAt);
      if (local && !useLocal) void localDrafts.remove(articleId);
      const start = useLocal ? { ...d, doc: local.doc, canvas: local.canvas, meta: local.meta } : d;
      docRef.current = ensureSectionIds(start.doc);
      canvasRef.current = start.canvas;
      metaRef.current = start.meta;
      versionRef.current = useLocal ? local.baseVersion : d.version;
      if (useLocal) { changeCount.current = 1; setSaveState('dirty'); setFromDevice(true); }
      slugTouched.current = d.publishedVersion !== null || d.meta.slug !== slugify(d.meta.title);
      setMetaState(start.meta);
      setStatus(d.status);
      setSavedVersion(d.version);
      setPublishedDraftVersion(d.publishedDraftVersion);
      setDraft(start);
    })().catch((err: unknown) => { if (!cancelled) setLoadError(err); });
    return () => { cancelled = true; };
  }, [articleId, services]);

  /** Writes the current unsaved state to this device right away. */
  const flushLocal = useCallback(async () => {
    window.clearTimeout(autosaveTimer.current);
    if (changeCount.current === 0 || !docRef.current || !canvasRef.current || !metaRef.current) return;
    await localDrafts.put({
      articleId, baseVersion: versionRef.current, savedAt: Date.now(),
      doc: docRef.current, canvas: canvasRef.current, meta: metaRef.current
    });
  }, [articleId]);

  const scheduleLocalSave = useCallback(() => {
    window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      if (!docRef.current || !canvasRef.current || !metaRef.current) return;
      void localDrafts.put({
        articleId, baseVersion: versionRef.current, savedAt: Date.now(),
        doc: docRef.current, canvas: canvasRef.current, meta: metaRef.current
      });
    }, 1500);
  }, [articleId]);

  const markChanged = useCallback(() => {
    changeCount.current += 1;
    if (!savingRef.current) setSaveState(s => (s === 'conflict' ? s : 'dirty'));
    scheduleLocalSave();
  }, [scheduleLocalSave]);

  /** `forSession`: the session the change came from; changes from an older (unmounted) session are dropped. */
  const setDoc = useCallback((doc: Doc, forSession?: number) => {
    if (forSession !== undefined && forSession !== sessionRef.current) return;
    docRef.current = doc;
    markChanged();
  }, [markChanged]);
  const setCanvas = useCallback((scene: CanvasScene, forSession?: number) => {
    if (forSession !== undefined && forSession !== sessionRef.current) return;
    canvasRef.current = scene;
    markChanged();
  }, [markChanged]);
  const setMeta = useCallback((patch: Partial<ArticleMeta>, opts?: { slugEdited?: boolean }) => {
    if (!metaRef.current) return;
    if (opts?.slugEdited) slugTouched.current = true;
    const next = { ...metaRef.current, ...patch };
    // Until the article is published (or the slug was edited by hand) the address follows the title.
    if (patch.title !== undefined && !slugTouched.current) next.slug = slugify(patch.title);
    metaRef.current = next;
    setMetaState(next);
    markChanged();
  }, [markChanged]);

  // ---- save ----
  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current || !docRef.current || !canvasRef.current || !metaRef.current) return false;
    savingRef.current = true;
    const startedAt = changeCount.current;
    const doc = docRef.current;
    setSaveState('saving');
    setSaveError('');
    try {
      versionRef.current = await services.articles.saveDraft(articleId, versionRef.current, {
        doc, canvas: canvasRef.current, meta: metaRef.current,
        readingMinutes: readingMinutes(doc)
      });
      setSavedVersion(versionRef.current);
      setLastSavedAt(Date.now());
      const clean = changeCount.current === startedAt;
      setSaveState(clean ? 'saved' : 'dirty');
      if (clean) { changeCount.current = 0; setFromDevice(false); }
      if (clean) { window.clearTimeout(autosaveTimer.current); void localDrafts.remove(articleId); }
      invalidate('articles:');
      return true;
    } catch (err) {
      setSaveState(AppError.is(err, 'CONFLICT') ? 'conflict' : 'error');
      setSaveError(errorMessage(err));
      return false;
    } finally {
      savingRef.current = false;
    }
  }, [articleId, services]);

  /** Conflict resolution: keep my version (re-base on the server's latest version, then save). */
  const overwrite = useCallback(async () => {
    const latest = await services.articles.getDraft(articleId);
    if (latest) versionRef.current = latest.version;
    await save();
  }, [articleId, save, services]);

  /** Conflict resolution: drop my changes and load the server copy. */
  const discardAndReload = useCallback(async () => {
    await localDrafts.remove(articleId);
    window.location.reload();
  }, [articleId]);

  /** Replaces the whole editing session (editor + canvas remount from this content). */
  const replaceContent = useCallback((doc: Doc, canvas: CanvasScene, meta: ArticleMeta) => {
    docRef.current = doc;
    canvasRef.current = canvas;
    metaRef.current = meta;
    setMetaState(meta);
    setDraft(d => (d ? { ...d, doc, canvas, meta } : d));
    sessionRef.current += 1;
    setSessionKey(sessionRef.current);
  }, []);

  /** Discard unsaved changes: back to the server copy; this device's copy is deleted. */
  const discardChanges = useCallback(async () => {
    window.clearTimeout(autosaveTimer.current);
    await localDrafts.remove(articleId);
    const d = await services.articles.getDraft(articleId);
    if (!d) return;
    versionRef.current = d.version;
    changeCount.current = 0;
    setSavedVersion(d.version);
    replaceContent(ensureSectionIds(d.doc), d.canvas, d.meta);
    setSaveState('saved');
    setFromDevice(false);
  }, [articleId, replaceContent, services]);

  // ---- publish ----
  const publish = useCallback(async (): Promise<boolean> => {
    setPublishing(true);
    try {
      if (changeCount.current > 0 && saveState !== 'saved' && !(await save())) return false;
      await services.articles.publish(articleId);
      setStatus('published');
      setPublishedDraftVersion(versionRef.current);
      invalidate('articles:');
      return true;
    } catch (err) {
      setSaveState('error');
      setSaveError(errorMessage(err));
      return false;
    } finally {
      setPublishing(false);
    }
  }, [articleId, save, saveState, services]);

  const unpublish = useCallback(async () => {
    await services.articles.unpublish(articleId);
    setStatus('draft');
    invalidate('articles:');
  }, [articleId, services]);

  /** Move to Trash (restorable from the Trash page). The local unsaved copy is kept until it's restored or purged. */
  const moveToTrash = useCallback(async () => {
    window.clearTimeout(autosaveTimer.current);
    await services.articles.trash(articleId);
    invalidate('articles:');
    invalidate('trash');
  }, [articleId, services]);

  // ---- Ctrl/⌘+S and the leave-page warning ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();       // also keeps Excalidraw's own Ctrl+S (save to file) out of the way
        void save();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [save]);

  useEffect(() => {
    const onHide = () => { void flushLocal(); };
    window.addEventListener('pagehide', onHide);
    const onVisibility = () => { if (document.visibilityState === 'hidden') void flushLocal(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      void flushLocal();
    };
  }, [flushLocal]);

  useEffect(() => {
    if (saveState === 'saved') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); void flushLocal(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushLocal, saveState]);

  return {
    draft, loadError, sessionKey, meta, status, saveState, saveError, lastSavedAt, publishing,
    /** True when publishing would change what readers see (never published, unsaved edits, or saved-but-unpublished). */
    hasUnpublishedChanges: status !== 'published' || saveState !== 'saved' || savedVersion !== publishedDraftVersion,
    fromDevice, discardChanges, flushLocal,
    docRef, canvasRef, setDoc, setCanvas, setMeta, save, overwrite, discardAndReload, publish, unpublish, moveToTrash
  };
}

export type DraftSession = ReturnType<typeof useDraftSession>;
