import type { Editor } from '@tiptap/core';
import { ArrowLeft, CircleAlert, CloudUpload, ExternalLink, Loader2, Settings2, Upload } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isSectionHeading } from '../../domain/content.ts';
import { templateByKey } from '../../domain/templates.ts';
import type { CanvasScene } from '../../domain/types.ts';
import { useStoredRatio } from '../../lib/useStoredRatio.ts';
import Logo from '../../ui/Logo.tsx';
import SplitPane from '../../ui/SplitPane.tsx';
import { ErrorState, Loading } from '../../ui/States.tsx';
import { useAuth } from '../auth/useAuth.ts';
import { createFrame, listFrames, scrollToFrame, type ExcalidrawImperativeAPI, type FrameInfo } from '../canvas/excalidraw.ts';
import ArticleSettingsDialog from './ArticleSettingsDialog.tsx';
import TextEditor from './TextEditor.tsx';
import type { CurrentSection } from './selection.ts';
import { useDraftSession, type SaveState } from './useDraftSession.ts';

const Canvas = lazy(() => import('../canvas/Canvas.tsx'));

/** The split editor: text on the left, Excalidraw on the right, sections linked to frames. */
export default function EditorPage() {
  const articleId = useParams().articleId ?? '';
  const session = useDraftSession(articleId);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [ratio, setRatio] = useStoredRatio('edit');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  // Frames come from the loaded scene until the canvas reports a change (per session, so a restore resets them).
  const [liveFrames, setLiveFrames] = useState<{ key: number; frames: FrameInfo[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const templateFramesDone = useRef(false);

  const { draft, sessionKey, setCanvas } = session;
  const loadedFrames = useMemo(() => (draft ? listFrames(draft.canvas.elements) : []), [draft]);
  const frames = liveFrames?.key === sessionKey ? liveFrames.frames : loadedFrames;

  const onCanvasChange = useCallback((scene: CanvasScene) => {
    setCanvas(scene);
    setLiveFrames(prev => {
      const next = listFrames(scene.elements);
      return prev?.key === sessionKey && JSON.stringify(next) === JSON.stringify(prev.frames) ? prev : { key: sessionKey, frames: next };
    });
  }, [sessionKey, setCanvas]);

  const linkFrame = useCallback((section: CurrentSection, frameId: string | null) => {
    if (!editor) return;
    editor.chain().focus().command(({ tr }) => {
      const node = tr.doc.nodeAt(section.pos);
      if (!node) return false;
      tr.setNodeMarkup(section.pos, undefined, { ...node.attrs, frameId });
      return true;
    }).run();
    if (frameId && api) scrollToFrame(api, frameId);
  }, [api, editor]);

  const newFrame = useCallback((section: CurrentSection) => {
    if (!api) return;
    linkFrame(section, createFrame(api, section.title || 'Frame'));
  }, [api, linkFrame]);

  const onActiveSection = useCallback((section: CurrentSection | null) => {
    if (section?.frameId && api) scrollToFrame(api, section.frameId);
  }, [api]);

  // New article from a template: create its named frames once, when both panes are ready.
  useEffect(() => {
    if (!editor || !api || !draft || templateFramesDone.current) return;
    templateFramesDone.current = true;
    const wanted = new Set(templateByKey(draft.templateKey)?.sections.filter(s => s.frame).map(s => s.title));
    const hasLinks = draft.doc.content.some(n => isSectionHeading(n) && n.attrs?.frameId);
    if (wanted.size === 0 || hasLinks || draft.canvas.elements.length > 0) return;
    const links: { pos: number; frameId: string }[] = [];
    editor.state.doc.forEach((node, pos) => {
      if (node.type.name === 'heading' && node.attrs.level === 2 && wanted.has(node.textContent)) {
        links.push({ pos, frameId: createFrame(api, node.textContent) });
      }
    });
    editor.chain().command(({ tr }) => {
      for (const { pos, frameId } of links) {
        const node = tr.doc.nodeAt(pos);
        if (node) tr.setNodeMarkup(pos, undefined, { ...node.attrs, frameId });
      }
      return true;
    }).run();
    if (links[0]) window.setTimeout(() => scrollToFrame(api, links[0]!.frameId, false), 50);
  }, [api, draft, editor]);

  const backTo = '/me/articles';
  const leave = (e: React.MouseEvent) => {
    if (session.saveState !== 'saved' && !window.confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  };

  const viewUrl = useMemo(() => (session.meta && profile ? `/${draft?.ownerUsername || profile.username}/${session.meta.slug}` : ''), [draft, profile, session.meta]);

  if (session.loadError) return <div className="editor-page"><main className="narrow" style={{ margin: '40px auto' }}><ErrorState error={session.loadError} /><Link to={backTo}>← Back to my articles</Link></main></div>;
  if (!draft || !session.meta) return <div className="editor-page"><Loading label="Opening article" /></div>;

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
          maxLength={160} title={session.meta.title} onChange={e => session.setMeta({ title: e.target.value })} />
        <span className={`badge ${session.status === 'published' ? 'badge-good' : 'badge-pending'}`}>{session.status}</span>
        <SaveIndicator state={session.saveState} lastSavedAt={session.lastSavedAt} />
        <span className="editor-bar-spacer" />
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

      <SplitPane ratio={ratio} onRatioChange={setRatio} leftLabel="Text" rightLabel="Canvas"
        left={(
          <div className="editor-text" key={`t${sessionKey}`}>
            <TextEditor initialDoc={draft.doc} frames={frames} onReady={setEditor} onChange={session.setDoc}
              onActiveSection={onActiveSection} onLinkFrame={linkFrame} onCreateFrame={newFrame} />
          </div>
        )}
        right={(
          <Suspense fallback={<Loading label="Loading canvas" />}>
            <Canvas key={`c${sessionKey}`} initialScene={draft.canvas} onApi={setApi} onSceneChange={onCanvasChange} />
          </Suspense>
        )}
      />

      {settingsOpen && (
        <ArticleSettingsDialog session={session} username={draft.ownerUsername || profile?.username || ''}
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
