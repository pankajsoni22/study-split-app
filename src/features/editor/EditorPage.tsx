import type { Editor } from '@tiptap/core';
import { ArrowLeft, CircleAlert, CloudUpload, ExternalLink, Loader2, Settings2, Sparkles, Upload } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_LAYOUT, layoutById, type LayoutId } from '../../domain/layouts.ts';
import { templateByKey } from '../../domain/templates.ts';
import type { CanvasScene } from '../../domain/types.ts';
import { readJson, writeJson } from '../../lib/storage.ts';
import LayoutPicker from '../../ui/LayoutPicker.tsx';
import Logo from '../../ui/Logo.tsx';
import SplitPane from '../../ui/SplitPane.tsx';
import { ErrorState, Loading } from '../../ui/States.tsx';
import { useAuth } from '../auth/useAuth.ts';
import { createSlide, listFrames, slideHasContent, updateFrames, type ExcalidrawImperativeAPI } from '../canvas/excalidraw.ts';
import FormatBar from '../canvas/FormatBar.tsx';
import ArticleSettingsDialog from './ArticleSettingsDialog.tsx';
import SlideStrip, { type SlideRef } from './SlideStrip.tsx';
import TextEditor from './TextEditor.tsx';
import type { CurrentSection } from './selection.ts';
import { useDraftSession, type SaveState } from './useDraftSession.ts';
import { useEditorView } from './useEditorView.ts';

const Canvas = lazy(() => import('../canvas/Canvas.tsx'));

/** The split editor: text on the left, Excalidraw on the right, sections linked to frames. */
export default function EditorPage() {
  const articleId = useParams().articleId ?? '';
  const session = useDraftSession(articleId);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nativeProps, setNativeProps] = useState(false);
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
    setCanvas(withLayout);
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
    setDoc(doc);
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(syncSlides, 300);
  }, [setDoc, syncSlides]);

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
  const leave = (e: React.MouseEvent) => {
    if (session.saveState !== 'saved' && !window.confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  };

  const viewUrl = useMemo(() => (session.meta && profile ? `/${draft?.ownerUsername || profile.username}/${session.meta.slug}` : ''), [draft, profile, session.meta]);

  if (session.loadError) return <div className="editor-page"><main className="narrow" style={{ margin: '40px auto' }}><ErrorState error={session.loadError} /><Link to={backTo}>← Back to my articles</Link></main></div>;
  if (!draft || !session.meta) return <div className="editor-page"><Loading label="Opening article" /></div>;

  const strip = (
    <SlideStrip slides={slides} activeSectionId={activeSlide?.sectionId ?? null}
      scene={thumbScene?.key === sessionKey ? thumbScene.scene : draft.canvas} onSelect={selectSlide} onAdd={addSlide}
      pinned={stripPinned} onPinnedChange={pinStrip} />
  );

  async function publish() {
    setNotice('');
    if (await session.publish()) setNotice('published');
  }

  return (
    <div className="editor-page">
      <header className="editor-bar">
        <Link to={backTo} className="icon-btn icon-btn-plain" onClick={leave} aria-label="Back to my articles" title="My articles">
          <ArrowLeft size={18} />
        </Link>
        <Logo size={26} className="editor-logo" />
        <input className="bar-title-input" value={session.meta.title} placeholder="Article title" aria-label="Article title"
          maxLength={160} title={session.meta.title} onChange={e => session.setMeta({ title: e.target.value })}
          onFocus={() => editorView.activity('write')} />
        <span className={`badge ${session.status === 'published' ? 'badge-good' : 'badge-pending'}`}>{session.status}</span>
        <SaveIndicator state={session.saveState} lastSavedAt={session.lastSavedAt} />
        <span className="editor-bar-spacer" />
        <button type="button" className={`btn btn-ghost btn-sm auto-toggle${editorView.auto ? ' is-on' : ''}`} aria-pressed={editorView.auto}
          onClick={editorView.toggleAuto}
          title={'Auto layout: more room for text while you write (60:40), more room for the canvas while you draw (40:60).\n'
            + 'Picking a layout yourself turns it off.'}>
          <Sparkles size={14} aria-hidden="true" /> Auto
        </button>
        <LayoutPicker value={viewLayout} onChange={editorView.pick} label="Editor layout (text : drawing)" />
        {session.status === 'published' && (
          <a className="btn btn-ghost btn-sm" href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${viewUrl}`} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" /> View
          </a>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={15} aria-hidden="true" /> Settings
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={session.saveState === 'saved' || session.saveState === 'saving'}
          onClick={() => void session.save()} title="Save (Ctrl+S)">
          {session.saveState === 'saving' ? <Loader2 size={15} className="spin-icon" aria-hidden="true" /> : <CloudUpload size={15} aria-hidden="true" />}
          {session.saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-sm" disabled={session.publishing || session.saveState === 'saving'} onClick={() => void publish()}>
          <Upload size={15} aria-hidden="true" />
          {session.publishing ? 'Publishing…' : session.status === 'published' ? 'Publish update' : 'Publish'}
        </button>
        {session.saveState === 'saving' && <span className="progress-bar" role="progressbar" aria-label="Saving" />}
      </header>

      {session.restoreOffer && (
        <div className="banner editor-banner" role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span style={{ flex: 1 }}>Unsaved changes from {new Date(session.restoreOffer.savedAt).toLocaleString()} were found on this device.</span>
          <button type="button" className="btn btn-sm" onClick={session.acceptRestore}>Restore them</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={session.declineRestore}>Discard</button>
        </div>
      )}
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
        <div className="banner banner-good editor-banner" role="status">
          <span style={{ flex: 1 }}>Published! Readers now see this version.</span>
          <a className="btn btn-sm" href={`${import.meta.env.BASE_URL.replace(/\/$/, '')}${viewUrl}`} target="_blank" rel="noreferrer">View article</a>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNotice('')}>Close</button>
        </div>
      )}

      <SplitPane layout={viewLayout} defaultLayout={articleLayout} onLayoutChange={editorView.pick} notice={editorView.notice}
        leftLabel="Text" rightLabel="Slides"
        left={(
          <div className="editor-text" key={`t${sessionKey}`} onFocusCapture={() => editorView.activity('write')}>
            <TextEditor initialDoc={draft.doc} onReady={setEditor} onChange={onTextChange} onActiveSection={onActiveSection} />
          </div>
        )}
        right={(
          <div className="slide-pane">
            <div className="canvas-zone" onPointerUpCapture={() => editorView.activity('draw')}>
              <FormatBar api={api} nativeOpen={nativeProps} onToggleNative={() => setNativeProps(o => !o)} />
              <Suspense fallback={<Loading label="Loading canvas" />}>
                <Canvas key={`c${sessionKey}`} initialScene={draft.canvas} slideId={activeSlide?.frameId ?? null} showNativeProps={nativeProps}
                  onApi={setApi} onSceneChange={onCanvasChange} />
              </Suspense>
            </div>
            {!stripPinned && strip}
          </div>
        )}
      />
      {stripPinned && strip}

      {settingsOpen && (
        <ArticleSettingsDialog session={session} username={draft.ownerUsername || profile?.username || ''}
          articleLayout={articleLayout} onArticleLayout={changeArticleLayout}
          onClose={() => setSettingsOpen(false)} onDeleted={() => void navigate(backTo, { replace: true })} />
      )}
    </div>
  );
}

function SaveIndicator({ state, lastSavedAt }: { state: SaveState; lastSavedAt: number | null }) {
  const text: Record<SaveState, string> = {
    saved: lastSavedAt ? `Saved · ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'All changes saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    error: "Couldn't save",
    conflict: 'Save conflict'
  };
  return <span className={`save-indicator is-${state}`} role="status" aria-live="polite"><span className="dot" aria-hidden="true" />{text[state]}</span>;
}
