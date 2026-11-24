import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureSectionIds, hasBriefContent, readingMinutes, type Doc } from '../../domain/content.ts';
import { slugify } from '../../domain/slug.ts';
import type { ArticleDraft, ArticleMeta, CanvasScene } from '../../domain/types.ts';
import { AppError, errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import { localDrafts, type LocalDraft } from '../../lib/localDrafts.ts';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

/** What was on screen before a restore (for Undo restore). */
interface Snapshot { doc: Doc; canvas: CanvasScene; meta: ArticleMeta; state: SaveState }

/**
 * Editor state + saving rules (docs §6.4, idea #13):
 * - Changes mark the draft dirty; nothing goes to the server until Save / Ctrl+S (keeps backend load low).
 * - Every change is also written to IndexedDB after 1.5 s idle, so nothing is lost if the tab dies.
 * - Saves carry the version they were based on; a stale save becomes a "conflict", never a silent overwrite.
 */
export function useDraftSession(articleId: string) {
  const services = getServices();
  const [draft, setDraft] = useState<ArticleDraft | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  /**
   * Restore banner (decided 2026-11-22). One banner, closed only by its ✕:
   *   offer    — a newer local copy exists; the saved copy is on screen          [Restore] [✕]
   *   restored — the local copy is on screen; `before` is what it replaced       [Undo restore] [✕]
   * Restore/Undo switch between the two; saving never closes it.
   */
  const [restore, setRestore] = useState<{ local: LocalDraft; mode: 'offer' | 'restored'; before: Snapshot | null } | null>(null);
  /** Bumped when content is replaced from outside (restore / reload) so editor + canvas remount. */
  const [sessionKey, setSessionKey] = useState(0);
  const [meta, setMetaState] = useState<ArticleMeta | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<ArticleDraft['status']>('draft');
  const [publishing, setPublishing] = useState(false);
  /** Draft version saved on the server, and the draft version readers see (for "anything new to publish?"). */
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [publishedDraftVersion, setPublishedDraftVersion] = useState<number | null>(null);
  /** What was on screen before a restore, so the restore can be undone exactly. */

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
  /** Set once a save happens after a restore: undoing then needs a save to reach the server. */
  const savedSinceRestore = useRef(false);

  // ---- load (1 DB call) + local copy check ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await services.articles.getDraft(articleId);
      if (cancelled) return;
      if (!d) { setLoadError(new AppError('NOT_FOUND', 'Article not found, or you cannot edit it.')); return; }
      docRef.current = ensureSectionIds(d.doc);
      canvasRef.current = d.canvas;
      metaRef.current = d.meta;
      versionRef.current = d.version;
      slugTouched.current = d.publishedVersion !== null || d.meta.slug !== slugify(d.meta.title);
      setMetaState(d.meta);
      setStatus(d.status);
      setSavedVersion(d.version);
      setPublishedDraftVersion(d.publishedDraftVersion);
      setDraft(d);
      const local = await localDrafts.get(articleId);
      if (!cancelled && local && local.savedAt > Date.parse(d.updatedAt)) setRestore({ local, mode: 'offer', before: null });
    })().catch((err: unknown) => { if (!cancelled) setLoadError(err); });
    return () => { cancelled = true; };
  }, [articleId, services]);

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
        hasBrief: hasBriefContent(doc), readingMinutes: readingMinutes(doc)
      });
      setSavedVersion(versionRef.current);
      setLastSavedAt(Date.now());
      savedSinceRestore.current = true;   // the server now holds the restored version
      const clean = changeCount.current === startedAt;
      setSaveState(clean ? 'saved' : 'dirty');
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

  /** Offer → restored: show the local copy, remembering what was on screen. */
  const acceptRestore = useCallback(() => {
    if (!restore || restore.mode !== 'offer' || !docRef.current || !canvasRef.current || !metaRef.current) return;
    const before: Snapshot = { doc: docRef.current, canvas: canvasRef.current, meta: metaRef.current, state: saveState };
    savedSinceRestore.current = false;
    replaceContent(restore.local.doc, restore.local.canvas, restore.local.meta);
    setRestore({ ...restore, mode: 'restored', before });
    changeCount.current += 1;
    setSaveState('dirty');
  }, [replaceContent, restore, saveState]);

  /** Restored → offer: exactly what was there before "Restore". The banner stays (Restore is offered again). */
  const undoRestore = useCallback(() => {
    if (!restore || restore.mode !== 'restored' || !restore.before) return;
    const { before } = restore;
    replaceContent(before.doc, before.canvas, before.meta);
    window.clearTimeout(autosaveTimer.current);
    if (savedSinceRestore.current) { changeCount.current += 1; setSaveState('dirty'); }   // server holds the restored copy
    else setSaveState(before.state);
    setRestore({ ...restore, mode: 'offer', before: null });
  }, [replaceContent, restore]);

  /**
   * ✕ closes the banner.
   * - offer (saved copy on screen): the local copy is deleted, so it is not offered again. If there are newer unsaved
   *   edits from this session, those are kept as the local copy instead, so nothing typed since opening is lost.
   * - restored: just closes. The local copy is deleted when the article is saved (see save()).
   */
  const closeRestore = useCallback(() => {
    if (!restore) return;
    if (restore.mode === 'offer') {
      window.clearTimeout(autosaveTimer.current);
      if (saveState === 'saved' || !docRef.current || !canvasRef.current || !metaRef.current) {
        void localDrafts.remove(articleId);
      } else {
        void localDrafts.put({ articleId, baseVersion: versionRef.current, savedAt: Date.now(), doc: docRef.current, canvas: canvasRef.current, meta: metaRef.current });
      }
    }
    setRestore(null);
  }, [articleId, restore, saveState]);

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
    if (saveState === 'saved') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saveState]);

  return {
    draft, loadError, sessionKey, meta, status, saveState, saveError, lastSavedAt, publishing,
    /** True when publishing would change what readers see (never published, unsaved edits, or saved-but-unpublished). */
    hasUnpublishedChanges: status !== 'published' || saveState !== 'saved' || savedVersion !== publishedDraftVersion,
    restore: restore ? { mode: restore.mode, local: restore.local } : null, acceptRestore, undoRestore, closeRestore,
    docRef, canvasRef, setDoc, setCanvas, setMeta, save, overwrite, discardAndReload, publish, unpublish, moveToTrash
  };
}

export type DraftSession = ReturnType<typeof useDraftSession>;
