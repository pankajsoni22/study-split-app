import type { Editor } from '@tiptap/core';
import { ArrowLeft, CircleAlert, CloudUpload, Ellipsis, ExternalLink, Loader2, Maximize2, Minimize2, PanelLeft, PanelRight, Settings2, Sparkles, Trash2, Upload } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_LAYOUT, layoutById, type LayoutId } from '../../domain/layouts.ts';
import { templateByKey } from '../../domain/templates.ts';
import type { CanvasScene } from '../../domain/types.ts';
import { readJson, writeJson } from '../../lib/storage.ts';
import Dialog from '../../ui/Dialog.tsx';
import TimedToast from '../../ui/TimedToast.tsx';
import LayoutPicker from '../../ui/LayoutPicker.tsx';
import MenuButton from '../../ui/MenuButton.tsx';
import Logo from '../../ui/Logo.tsx';
import SplitPane from '../../ui/SplitPane.tsx';
import { ErrorState, Loading } from '../../ui/States.tsx';
import { errorMessage } from '../../data/errors.ts';
import { getServices } from '../../data/services.ts';
import { invalidate } from '../../data/useQuery.ts';
import { useAuth } from '../auth/useAuth.ts';
import { createSlide, deleteFrameIfEmpty, deleteSlide, listFrames, slideHasContent, updateFrames, type ExcalidrawImperativeAPI } from '../canvas/excalidraw.ts';
import FormatBar from '../canvas/FormatBar.tsx';
import ArticleSettingsDialog from './ArticleSettingsDialog.tsx';
import SlideStrip, { type LinkTarget, type SlideRef } from './SlideStrip.tsx';
import TextEditor from './TextEditor.tsx';
import type { CurrentSection } from './selection.ts';
import { useDraftSession, type SaveState } from './useDraftSession.ts';
import { useEditorView } from './useEditorView.ts';
import { useFullscreenPane } from './useFullscreenPane.ts';

const Canvas = lazy(() => import('../canvas/Canvas.tsx'));

/** The split editor: text on the left, Excalidraw on the right, sections linked to frames. */
export default function EditorPage() {
  const articleId = useParams().articleId ?? '';
  const session = useDraftSession(articleId);
  const { profile } = useAuth();
  const navigate = useNavigate();
  // Editor and canvas are tagged with the session they belong to: after a restore (new session) the old,
  // unmounted ones must never be used (the old canvas reports an EMPTY scene once it unmounts).
  const [editorTag, setEditorTag] = useState<{ key: number; editor: Editor } | null>(null);
  const [apiTag, setApiTag] = useState<{ key: number; api: ExcalidrawImperativeAPI } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nativeProps, setNativeProps] = useState(false);
  const [publishAsk, setPublishAsk] = useState(false);
  const [notice, setNotice] = useState('');
  const [slides, setSlides] = useState<SlideRef[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  /** Scene snapshot for thumbnails: refreshed 0.7 s after drawing stops (not on every stroke). */
  const [thumbScene, setThumbScene] = useState<{ key: number; scene: CanvasScene } | null>(null);
  const [stripPinned, setStripPinned] = useState<boolean>(() => readJson('ss.editor.stripPinned', false));
  const pinStrip = useCallback((pinned: boolean) => { setStripPinned(pinned); writeJson('ss.editor.stripPinned', pinned); }, []);
  const editorView = useEditorView();
  const syncTimer = useRef<number | undefined>(undefined);
  const thumbTimer = useRef<number | undefined>(undefined);

  const { draft, sessionKey, setCanvas, setDoc, canvasRef } = session;
  const editor = editorTag?.key === sessionKey && !editorTag.editor.isDestroyed ? editorTag.editor : null;
  const api = apiTag?.key === sessionKey ? apiTag.api : null;
  const onEditorReady = useCallback((e: Editor) => setEditorTag({ key: sessionKey, editor: e }), [sessionKey]);
  const onCanvasApi = useCallback((a: ExcalidrawImperativeAPI) => setApiTag({ key: sessionKey, api: a }), [sessionKey]);
  /** Drawn slides that no section points to (recoverable from the slides panel). */
  const [orphans, setOrphans] = useState<{ frameId: string; title: string }[]>([]);

  // ---- Article layout: slide shape + readers' default. Stored with the canvas (versioned on publish).
  //      Changed in Settings. Separate from the editor's on-screen split (editorView, incl. Auto). ----
  const [articlePick, setArticlePick] = useState<{ key: number; id: LayoutId } | null>(null);
  const articleLayout: LayoutId = articlePick?.key === sessionKey
    ? articlePick.id
    : draft?.canvas.layout ?? templateByKey(draft?.templateKey)?.layout ?? DEFAULT_LAYOUT;
  const layoutRef = useRef(articleLayout);
  useEffect(() => { layoutRef.current = articleLayout; }, [articleLayout]);
  const viewLayout: LayoutId = editorView.view ?? articleLayout;

  const onCanvasChange = useCallback((scene: CanvasScene) => {
    const withLayout = { ...scene, layout: layoutRef.current };
    setCanvas(withLayout, sessionKey);
    window.clearTimeout(thumbTimer.current);
    thumbTimer.current = window.setTimeout(() => setThumbScene({ key: sessionKey, scene: withLayout }), 700);
  }, [sessionKey, setCanvas]);

  /**
   * One slide per section: every H2 gets a slide (created on the canvas and linked through the heading's
   * frameId), slide names follow section titles, and the strip lists slides in text order.
   */
  const syncSlides = useCallback(() => {
    if (!editor || !api) return;
    const layout = layoutById(layoutRef.current);
    const frames = new Map(listFrames(api.getSceneElements()).map(f => [f.id, f]));
    const links: { pos: number; frameId: string }[] = [];
    const renames = new Map<string, { name: string }>();
    const next: SlideRef[] = [];
    editor.state.doc.forEach((node, pos) => {
      if (node.type.name !== 'heading' || node.attrs.level !== 2 || !node.attrs.sectionId) return;
      const title = node.textContent.trim() || 'Untitled section';
      let frameId = node.attrs.frameId as string | null;
      if (!frameId || !frames.has(frameId)) {
        frameId = createSlide(api, title, layout);
        frames.set(frameId, { id: frameId, name: title });
        links.push({ pos, frameId });
      } else if (frames.get(frameId)?.name !== title) {
        renames.set(frameId, { name: title });
      }
      next.push({ sectionId: node.attrs.sectionId as string, title, frameId });
    });
    updateFrames(api, renames);
    const linked = new Set([...next.map(n => n.frameId), ...links.map(l => l.frameId)]);
    const elements = api.getSceneElements();
    const lost = [...frames.values()].filter(f => !linked.has(f.id) && slideHasContent(elements, f.id)).map(f => ({ frameId: f.id, title: f.name }));
    setOrphans(prev => (JSON.stringify(prev) === JSON.stringify(lost) ? prev : lost));
    if (links.length) {
      editor.chain().command(({ tr }) => {
        for (const { pos, frameId } of links) {
          const node = tr.doc.nodeAt(pos);
          if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, frameId });
        }
        tr.setMeta('addToHistory', false);      // linking is bookkeeping, not something to undo
        return true;
      }).run();
    }
    setSlides(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [api, editor]);

  useEffect(() => { syncSlides(); }, [syncSlides, sessionKey]);

  const onTextChange = useCallback((doc: Parameters<typeof setDoc>[0]) => {
    setDoc(doc, sessionKey);
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(syncSlides, 300);
  }, [sessionKey, setDoc, syncSlides]);

  const onActiveSection = useCallback((section: CurrentSection | null) => {
    setActiveSectionId(section?.sectionId ?? null);
  }, []);

  /** Text before the first section shows the first slide. */
  const activeSlide = slides.find(sl => sl.sectionId === activeSectionId) ?? slides[0] ?? null;

  const headingPos = useCallback((sectionId: string) => {
    const hits: { pos: number; size: number }[] = [];
    editor?.state.doc.forEach((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.sectionId === sectionId) hits.push({ pos, size: node.nodeSize });
    });
    return hits[0] ?? null;
  }, [editor]);

  const selectSlide = useCallback((sectionId: string) => {
    const h = headingPos(sectionId);
    if (!editor || !h) return;
    setActiveSectionId(sectionId);
    // No focus(): browsing slides shouldn't count as "writing" for Auto layout.
    editor.chain().setTextSelection(h.pos + h.size - 1).scrollIntoView().run();
  }, [editor, headingPos]);

  /** New section + slide right after the current section (or at the end). */
  const addSlide = useCallback(() => {
    if (!editor) return;
    const current = activeSlide ? headingPos(activeSlide.sectionId) : null;
    let insertAt = editor.state.doc.content.size;
    editor.state.doc.forEach((node, pos) => {
      if (current && pos > current.pos && insertAt === editor.state.doc.content.size && node.type.name === 'heading' && node.attrs.level === 2) insertAt = pos;
    });
    const title = 'New section';
    editor.chain().focus()
      .insertContentAt(insertAt, [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: title }] }, { type: 'paragraph' }])
      .setTextSelection({ from: insertAt + 1, to: insertAt + 1 + title.length })
      .scrollIntoView()
      .run();
  }, [activeSlide, editor, headingPos]);

  /** Recovery: link an unlinked (but drawn) slide to the current section; its old slide is removed if empty. */
  /**
   * Links an unlinked slide to a section.
   * - target = { section }: that section now uses this slide. Its previous slide is removed if empty; if it has
   *   drawings it becomes unlinked in turn (nothing is ever lost).
   * - target = 'new': a new section is added at the end of the article, titled like the slide.
   */
  const adoptSlide = useCallback((frameId: string, target: LinkTarget) => {
    if (!editor || !api) return;
    if (target === 'new') {
      const title = orphans.find(o => o.frameId === frameId)?.title || 'New section';
      const end = editor.state.doc.content.size;
      editor.chain().focus()
        .insertContentAt(end, [{ type: 'heading', attrs: { level: 2, frameId }, content: [{ type: 'text', text: title }] }, { type: 'paragraph' }])
        .setTextSelection(end + 1 + title.length)
        .scrollIntoView()
        .run();
    } else {
      const h = headingPos(target.section);
      const current = slides.find(sl => sl.sectionId === target.section);
      if (!h) return;
      editor.chain().command(({ tr }) => {
        const node = tr.doc.nodeAt(h.pos);
        if (node) tr.setNodeMarkup(h.pos, undefined, { ...node.attrs, frameId });
        return true;
      }).run();
      if (current) deleteFrameIfEmpty(api, current.frameId);
      setActiveSectionId(target.section);
    }
    window.setTimeout(syncSlides, 0);
  }, [api, editor, headingPos, orphans, slides, syncSlides]);

  /** Deletes an unlinked slide and its drawings (after the strip asked for confirmation). */
  const deleteOrphan = useCallback((frameId: string) => {
    if (!api) return;
    deleteSlide(api, frameId);
    window.setTimeout(syncSlides, 0);
  }, [api, syncSlides]);

  /** Author changes the article layout: slides take the new shape (drawings keep their size and place). */
  const changeArticleLayout = useCallback((id: LayoutId) => {
    const target = layoutById(id);
    if (api) {
      const elements = api.getSceneElements();
      const frames = listFrames(elements);
      const drawn = frames.some(f => slideHasContent(elements, f.id));
      if (drawn && !window.confirm(
        `Switch to ${target.label}? Slides change shape to ${target.slide.width}×${target.slide.height}. ` +
        'Drawings keep their size and position, so some may need moving.')) return;
      layoutRef.current = id;
      setArticlePick({ key: sessionKey, id });
      updateFrames(api, new Map(frames.map(f => [f.id, { width: target.slide.width, height: target.slide.height }])));
    } else {
      layoutRef.current = id;
      setArticlePick({ key: sessionKey, id });
    }
    const scene = canvasRef.current ?? draft?.canvas;
    if (scene) setCanvas({ ...scene, layout: id });
  }, [api, canvasRef, draft, sessionKey, setCanvas]);

  const backTo = '/me/articles';
  const [leaveAsk, setLeaveAsk] = useState(false);
  const fullscreen = useFullscreenPane();
  const leave = (e: React.MouseEvent) => {
    if (session.saveState === 'saved') return;
    e.preventDefault();
    setLeaveAsk(true);
  };

  const viewUrl = useMemo(() => (session.meta && profile ? `/${draft?.ownerUsername || profile.username}/${session.meta.slug}` : ''), [draft, profile, session.meta]);

  if (session.loadError) return <div className="editor-page"><main className="narrow" style={{ margin: '40px auto' }}><ErrorState error={session.loadError} /><Link to={backTo}>← Back to my articles</Link></main></div>;
  if (!draft || !session.meta) return <div className="editor-page"><Loading label="Opening article" /></div>;
  if (draft.deletedAt) return <TrashedNotice articleId={articleId} title={session.meta.title} deletedAt={draft.deletedAt} />;

  const strip = (
    <SlideStrip slides={slides} activeSectionId={activeSlide?.sectionId ?? null}
      scene={thumbScene?.key === sessionKey ? thumbScene.scene : draft.canvas} onSelect={selectSlide} onAdd={addSlide}
      pinned={stripPinned} onPinnedChange={pinStrip} orphans={orphans} onAdopt={adoptSlide} onDeleteOrphan={deleteOrphan} />
  );

  async function publish() {
    setNotice('');
    if (await session.publish()) setNotice('published');
  }

  return (
    <div className={`editor-page${fullscreen.pane ? ` is-fullscreen is-fullscreen-${fullscreen.pane}` : ''}`}>
      <header className="editor-bar">
        <Link to={backTo} className="icon-btn icon-btn-plain" onClick={leave} aria-label="Back to my articles" title="My articles">
          <ArrowLeft size={18} />
        </Link>
        <Logo size={26} className="editor-logo" />
        <div className="bar-titles">
          <input className="bar-title-input" value={session.meta.title} placeholder="Article title" aria-label="Article title"
            maxLength={160} title={session.meta.title} onChange={e => session.setMeta({ title: e.target.value })}
            onFocus={() => editorView.activity('write')} />
          <div className="bar-meta">
            <span className={`bar-status is-${session.status}`}>{session.status === 'published' ? 'Published' : 'Draft'}</span>
            <span className="bar-meta-sep" aria-hidden="true">·</span>
            <SaveIndicator state={session.saveState} lastSavedAt={session.lastSavedAt} fromDevice={session.fromDevice} />
            {session.saveState === 'dirty' && (
              <button type="button" className="link-button discard-link" title="Throw away the unsaved changes and go back to the saved version"
                onClick={() => { if (window.confirm('Discard your unsaved changes and go back to the saved version?')) void session.discardChanges(); }}>
                Discard
              </button>
            )}
          </div>
        </div>
        <span className="editor-bar-spacer" />
        {session.status === 'published' && (
          <a className="btn btn-ghost btn-sm" href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${viewUrl}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> View
          </a>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={session.saveState === 'saved' || session.saveState === 'saving'}
          onClick={() => void session.save()} title="Save (Ctrl+S)">
          {session.saveState === 'saving' ? <Loader2 size={15} className="spin-icon" aria-hidden="true" /> : <CloudUpload size={15} aria-hidden="true" />}
          {session.saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm"
          disabled={session.publishing || session.saveState === 'saving' || !session.hasUnpublishedChanges}
          title={session.hasUnpublishedChanges ? 'Publish this version for readers' : 'Nothing new to publish: readers already see this version'}
          onClick={() => setPublishAsk(true)}>
          <Upload size={15} aria-hidden="true" />
          {session.publishing ? 'Publishing…' : session.status === 'published' ? 'Publish update' : 'Publish'}
        </button>
        <MenuButton label="More options" trigger={<Ellipsis size={18} aria-hidden="true" />}>
          {close => (
            <>
              <button type="button" role="menuitemcheckbox" aria-checked={editorView.auto} className="menu-item" onClick={editorView.toggleAuto}
                title={'More room for text while you write (60:40), more room for the canvas while you draw (40:60).\nPicking a layout yourself turns it off.'}>
                <Sparkles size={16} aria-hidden="true" />
                <span className="menu-item-text">Auto layout<small>Resize for writing or drawing</small></span>
                <span className={`switch${editorView.auto ? ' is-on' : ''}`} aria-hidden="true" />
              </button>
              <div className="menu-section">
                <span className="menu-label">Editor layout (text : drawing)</span>
                <LayoutPicker value={viewLayout} onChange={editorView.pick} label="Editor layout (text : drawing)" />
              </div>
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); fullscreen.enter('text'); }}>
                <PanelLeft size={16} aria-hidden="true" /><span className="menu-item-text">Full screen: writing</span>
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); fullscreen.enter('canvas'); }}>
                <PanelRight size={16} aria-hidden="true" /><span className="menu-item-text">Full screen: drawing</span>
              </button>
              <div className="menu-sep" role="separator" />
              <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); setSettingsOpen(true); }}>
                <Settings2 size={16} aria-hidden="true" /><span className="menu-item-text">Article settings…<small>Title, address, summary, tags, Trash</small></span>
              </button>
            </>
          )}
        </MenuButton>
        {session.saveState === 'saving' && <span className="progress-bar" role="progressbar" aria-label="Saving" />}
      </header>

      {session.saveState === 'conflict' && (
        <div className="banner banner-error editor-banner" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span style={{ flex: 1 }}>This article was saved from another tab or device since you opened it.</span>
          <button type="button" className="btn btn-sm" onClick={() => void session.overwrite()}>Keep mine</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void session.discardAndReload()}>Load theirs</button>
        </div>
      )}
      {session.saveState === 'error' && (
        <div className="banner banner-error editor-banner" role="alert">
          <CircleAlert size={18} aria-hidden="true" /><span style={{ flex: 1 }}>{session.saveError}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void session.save()}>Retry</button>
        </div>
      )}
      {notice === 'published' && (
        <TimedToast seconds={10} onClose={() => setNotice('')}
          action={<a className="btn btn-sm" href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${viewUrl}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} aria-hidden="true" /> Read article</a>}>
          <b>Published!</b> Readers now see this version.
        </TimedToast>
      )}

      <SplitPane layout={viewLayout} defaultLayout={articleLayout} onLayoutChange={editorView.pick} notice={editorView.notice}
        leftLabel="Text" rightLabel="Drawing"
        focus={fullscreen.pane === 'text' ? 'left' : fullscreen.pane === 'canvas' ? 'right' : null}
        left={(
          <div className="editor-text" key={`t${sessionKey}`} onFocusCapture={() => editorView.activity('write')}>
            <TextEditor initialDoc={draft.doc} onReady={onEditorReady} onChange={onTextChange} onActiveSection={onActiveSection}
              trailing={<FullscreenButton on={fullscreen.pane === 'text'} what="writing" onClick={() => fullscreen.toggle('text')} />} />
          </div>
        )}
        right={(
          <div className="slide-pane">
            <div className="canvas-zone" onPointerUpCapture={() => editorView.activity('draw')}>
              <FormatBar api={api} slideId={activeSlide?.frameId ?? null} nativeOpen={nativeProps} onToggleNative={() => setNativeProps(o => !o)}
                trailing={<FullscreenButton on={fullscreen.pane === 'canvas'} what="drawing" onClick={() => fullscreen.toggle('canvas')} />} />
              <Suspense fallback={<Loading label="Loading canvas" />}>
                <Canvas key={`c${sessionKey}`} initialScene={draft.canvas} slideId={activeSlide?.frameId ?? null} showNativeProps={nativeProps}
                  onApi={onCanvasApi} onSceneChange={onCanvasChange} />
              </Suspense>
            </div>
            {!stripPinned && strip}
          </div>
        )}
      />
      {stripPinned && strip}

      {leaveAsk && (
        <LeaveDialog saving={session.saveState === 'saving'}
          onStay={() => setLeaveAsk(false)}
          onLeave={async () => { await session.flushLocal(); setLeaveAsk(false); void navigate(backTo); }}
          onSaveAndLeave={async () => { if (await session.save()) { setLeaveAsk(false); void navigate(backTo); } }}
          error={session.saveState === 'error' || session.saveState === 'conflict' ? session.saveError || 'Could not save.' : ''} />
      )}

      {publishAsk && (
        <PublishDialog title={session.meta.title} unsaved={session.saveState !== 'saved'} firstTime={session.status !== 'published'}
          onCancel={() => setPublishAsk(false)}
          onConfirm={async () => { await publish(); setPublishAsk(false); }} />
      )}

      {settingsOpen && (
        <ArticleSettingsDialog session={session} username={draft.ownerUsername || profile?.username || ''}
          articleLayout={articleLayout} onArticleLayout={changeArticleLayout}
          onClose={() => setSettingsOpen(false)}
          onTrashed={title => void navigate(backTo, { replace: true, state: { trashed: { id: articleId, title } } })} />
      )}
    </div>
  );
}

/** Leaving the editor with unsaved changes: save first (recommended), leave anyway (kept on this device), or stay. */
function LeaveDialog({ saving, error, onStay, onLeave, onSaveAndLeave }: {
  saving: boolean; error: string; onStay: () => void; onLeave: () => Promise<void>; onSaveAndLeave: () => Promise<void>;
}) {
  return (
    <Dialog title="Save your changes?" onClose={onStay}>
      <div className="dialog-body">
        <p>Your latest changes are not saved to the server yet.</p>
        <p className="leave-note">
          If you leave without saving, they stay <b>on this device</b> and will be right here when you open this article again
          (on this device and browser only).
        </p>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onStay}>Stay</button>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => void onLeave()}>Leave without saving</button>
        <button type="button" className="btn" disabled={saving} onClick={() => void onSaveAndLeave()}>
          <CloudUpload size={15} aria-hidden="true" /> {saving ? 'Saving…' : 'Save & leave'}
        </button>
      </div>
    </Dialog>
  );
}

/** Publishing asks first: "Save & publish" (unsaved edits) or "Publish", or Cancel (nothing changes). */
function PublishDialog({ title, unsaved, firstTime, onCancel, onConfirm }: {
  title: string; unsaved: boolean; firstTime: boolean; onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const name = title.trim() || 'Untitled';
  return (
    <Dialog title={firstTime ? 'Publish article?' : 'Publish changes?'} onClose={() => { if (!busy) onCancel(); }}>
      <div className="dialog-body">
        <p>Readers will see {firstTime ? '' : 'this version of '}<b>{name}</b>{firstTime ? ' at its address' : ' instead of the current one'}.</p>
        {unsaved && <p style={{ marginTop: 8 }}>You have unsaved changes; they will be saved first.</p>}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn" disabled={busy} onClick={() => { setBusy(true); void onConfirm().finally(() => setBusy(false)); }}>
          <Upload size={15} aria-hidden="true" />
          {busy ? 'Publishing…' : unsaved ? 'Save & publish' : 'Publish'}
        </button>
      </div>
    </Dialog>
  );
}

/** Opening an article that is in the Trash: it can't be edited until restored. */
function TrashedNotice({ articleId, title, deletedAt }: { articleId: string; title: string; deletedAt: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  async function restore() {
    setState({ busy: true, error: '' });
    try {
      await getServices().articles.restore(articleId);
      invalidate('articles:'); invalidate('trash');
      window.location.reload();
    } catch (err) { setState({ busy: false, error: errorMessage(err) }); }
  }
  return (
    <div className="editor-page">
      <main id="main" className="narrow" style={{ margin: '60px auto', padding: '0 16px' }}>
        <div className="card state">
          <span className="state-icon"><Trash2 size={24} aria-hidden="true" /></span>
          <h1 className="state-title">“{title}” is in the Trash</h1>
          <p className="muted">It was deleted on {new Date(deletedAt).toLocaleString()}. Restore it to read or edit it again.</p>
          {state.error && <p className="field-error" role="alert">{state.error}</p>}
          <div className="dialog-actions">
            <Link className="btn btn-ghost" to="/me/trash">Open Trash</Link>
            <button type="button" className="btn" disabled={state.busy} onClick={() => void restore()}>{state.busy ? 'Restoring…' : 'Restore'}</button>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Enter / leave full screen for one side of the editor. */
function FullscreenButton({ on, what, onClick }: { on: boolean; what: string; onClick: () => void }) {
  const label = on ? 'Exit full screen (Esc)' : `Full screen: ${what}`;
  return (
    <button type="button" className={`tb-btn fullscreen-btn${on ? ' is-on' : ''}`} aria-label={label} title={label} aria-pressed={on} onClick={onClick}>
      {on ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
    </button>
  );
}

function SaveIndicator({ state, lastSavedAt, fromDevice }: { state: SaveState; lastSavedAt: number | null; fromDevice: boolean }) {
  const text: Record<SaveState, string> = {
    saved: lastSavedAt ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'All changes saved',
    dirty: fromDevice ? 'Unsaved changes (on this device)' : 'Unsaved changes',
    saving: 'Saving…',
    error: "Couldn't save",
    conflict: 'Save conflict'
  };
  return <span className={`save-indicator is-${state}`} role="status" aria-live="polite"><span className="dot" aria-hidden="true" />{text[state]}</span>;
}
