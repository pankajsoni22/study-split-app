import { BookOpen, ChevronLeft, ChevronRight, Clock, Columns2, Eye, PenLine, Presentation } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { filterForLevel, splitSections, type ReadingLevel, type Section } from '../../domain/content.ts';
import type { PublishedArticle } from '../../domain/types.ts';
import { getServices } from '../../data/services.ts';
import { useQuery } from '../../data/useQuery.ts';
import { readJson, writeJson } from '../../lib/storage.ts';
import { formatCount, formatDate } from '../../lib/text.ts';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { useStoredRatio } from '../../lib/useStoredRatio.ts';
import { shouldRecordView } from '../../lib/viewCounter.ts';
import Avatar from '../../ui/Avatar.tsx';
import Logo from '../../ui/Logo.tsx';
import SplitPane from '../../ui/SplitPane.tsx';
import { ErrorState, Loading } from '../../ui/States.tsx';
import ThemeSwitch from '../../ui/ThemeSwitch.tsx';
import { scrollToFrame, type ExcalidrawImperativeAPI } from '../canvas/excalidraw.ts';
import FrameFigure from './FrameFigure.tsx';
import SectionView from './SectionView.tsx';

const Canvas = lazy(() => import('../canvas/Canvas.tsx'));

type Mode = 'flow' | 'present' | 'article';
interface ReadPrefs { mode?: Mode; level?: ReadingLevel; sectionId?: string; step?: number }

/** /:username/:slug — one RPC loads everything (docs §11.3). */
export default function ReaderPage() {
  const { username = '', slug = '' } = useParams();
  const q = useQuery(`article:${username.toLowerCase()}/${slug.toLowerCase()}`, s => s.articles.getPublished(username, slug));
  if (q.error) return <ReaderChrome><main className="reader-message"><ErrorState error={q.error} onRetry={q.reload} /></main></ReaderChrome>;
  if (q.data === undefined) return <ReaderChrome><Loading label="Loading article" /></ReaderChrome>;
  if (q.data === null) {
    return (
      <ReaderChrome>
        <main id="main" className="reader-message state">
          <h1>Article not found</h1>
          <p className="muted">It may be unpublished, private, or the link may be old.</p>
          <Link className="btn btn-ghost" to={`/${username}`}>See @{username}'s articles</Link>
        </main>
      </ReaderChrome>
    );
  }
  return <Reader key={q.data.id} article={q.data} />;
}

function ReaderChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="reader-page">
      <header className="reader-bar"><Link to="/" className="reader-home" aria-label="Study Split home"><Logo size={28} /></Link></header>
      {children}
    </div>
  );
}

function Reader({ article }: { article: PublishedArticle }) {
  const narrow = useIsNarrow();
  const prefsKey = `ss.read.${article.id}`;
  const [prefs, setPrefsState] = useState<ReadPrefs>(() => readJson<ReadPrefs>(prefsKey, {}));
  const setPrefs = useCallback((patch: ReadPrefs) => {
    setPrefsState(p => { const next = { ...p, ...patch }; writeJson(prefsKey, next); return next; });
  }, [prefsKey]);

  const mode: Mode = narrow && prefs.mode !== 'present' ? 'article' : (prefs.mode ?? 'flow');
  const level: ReadingLevel = article.hasBrief ? (prefs.level ?? 'detailed') : 'detailed';
  const sections = useMemo<Section[]>(
    () => splitSections(article.doc).map(s => ({ ...s, nodes: filterForLevel(s.nodes, level) })),
    [article.doc, level]
  );
  const [views, setViews] = useState(article.views);

  // FR-24: one view per browser per article per day. Fire and forget.
  useEffect(() => {
    if (shouldRecordView(article.id)) getServices().articles.recordView(article.id).then(n => { if (n > 0) setViews(n); }, () => {});
  }, [article.id]);

  // B toggles Brief/Detailed (docs §4.1)
  useEffect(() => {
    if (!article.hasBrief) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement)) {
        setPrefs({ level: level === 'brief' ? 'detailed' : 'brief' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [article.hasBrief, level, setPrefs]);

  return (
    <div className="reader-page">
      <header className="reader-bar">
        <Link to="/" className="reader-home" aria-label="Study Split home"><Logo size={28} /></Link>
        <span className="reader-bar-title" title={article.title}>{article.title}</span>
        <span className="editor-bar-spacer" />
        <div className="segmented segmented-sm" role="radiogroup" aria-label="Reading mode">
          {!narrow && <ModeButton current={mode} value="flow" label="Split" Icon={Columns2} onPick={m => setPrefs({ mode: m })} />}
          <ModeButton current={mode} value="present" label="Present" Icon={Presentation} onPick={m => setPrefs({ mode: m })} />
          <ModeButton current={mode} value="article" label="Article" Icon={BookOpen} onPick={m => setPrefs({ mode: m })} />
        </div>
        {article.hasBrief && (
          <div className="segmented segmented-sm" role="radiogroup" aria-label="Reading level (B)">
            {(['detailed', 'brief'] as const).map(l => (
              <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setPrefs({ level: l })}>
                {l === 'detailed' ? 'Detailed' : 'Brief'}
              </button>
            ))}
          </div>
        )}
        {!narrow && <ThemeSwitch compact />}
        {article.isOwner && !narrow && (
          <Link className="btn btn-ghost btn-sm" to={`/write/${article.id}`}><PenLine size={15} aria-hidden="true" /> Edit</Link>
        )}
      </header>
      {mode === 'flow' && <FlowMode article={article} sections={sections} views={views} prefs={prefs} setPrefs={setPrefs} />}
      {mode === 'present' && <PresentMode article={article} sections={sections} prefs={prefs} setPrefs={setPrefs} narrow={narrow} />}
      {mode === 'article' && (
        <ArticleMode article={article} sections={sections} views={views}
          onOpen={narrow ? undefined : sectionId => setPrefs({ mode: 'flow', sectionId })} />
      )}
    </div>
  );
}

function ModeButton({ current, value, label, Icon, onPick }: { current: Mode; value: Mode; label: string; Icon: typeof BookOpen; onPick: (m: Mode) => void }) {
  return (
    <button type="button" role="radio" aria-checked={current === value} onClick={() => onPick(value)} title={label}>
      <Icon size={15} aria-hidden="true" /><span className="hide-narrow">{label}</span>
    </button>
  );
}

function ArticleHeader({ article, views }: { article: PublishedArticle; views: number }) {
  return (
    <header className="article-head">
      <h1>{article.title}</h1>
      {article.summary && <p className="article-summary">{article.summary}</p>}
      <div className="article-meta">
        <Link to={`/${article.author.username}`} className="author-chip">
          <Avatar name={article.author.displayName ?? article.author.username} url={article.author.avatarUrl} />
          {article.author.displayName ?? `@${article.author.username}`}
        </Link>
        <span>{formatDate(article.publishedAt)}</span>
        {article.readingMinutes > 0 && <span><Clock size={13} aria-hidden="true" />{article.readingMinutes} min read</span>}
        <span><Eye size={13} aria-hidden="true" />{formatCount(views)} views</span>
        {article.visibility !== 'public' && <span className="badge badge-neutral">{article.visibility}</span>}
      </div>
      {article.tags.length > 0 && <div className="tag-list">{article.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>}
    </header>
  );
}

// ---------------------------------------------------------------- Flow (split, synced)
function FlowMode({ article, sections, views, prefs, setPrefs }: {
  article: PublishedArticle; sections: Section[]; views: number; prefs: ReadPrefs; setPrefs: (p: ReadPrefs) => void;
}) {
  const [ratio, setRatio] = useStoredRatio('read');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [active, setActive] = useState<string | null>(prefs.sectionId ?? sections[0]?.id ?? null);
  const restored = useRef(false);

  // Restore the last position (section-anchored, so it survives font/screen changes).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (prefs.sectionId) scrollRef.current?.querySelector(`[data-reader-section="${CSS.escape(prefs.sectionId)}"]`)?.scrollIntoView({ block: 'start' });
  }, [prefs.sectionId]);

  // The section crossing the upper third of the text pane is "active".
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const id = hit?.target.getAttribute('data-reader-section');
      if (id) setActive(id);
    }, { root, rootMargin: '-15% 0px -70% 0px' });
    root.querySelectorAll('[data-reader-section]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const activeFrame = sections.find(s => s.id === active)?.frameId ?? sections.find(s => s.frameId)?.frameId ?? null;
  useEffect(() => { if (api && activeFrame) scrollToFrame(api, activeFrame); }, [api, activeFrame]);
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setPrefs({ sectionId: active }), 400);
    return () => window.clearTimeout(t);
  }, [active, setPrefs]);

  return (
    <SplitPane ratio={ratio} onRatioChange={setRatio} leftLabel="Article text" rightLabel="Diagrams"
      left={(
        <div ref={scrollRef} className="reader-scroll" id="main">
          <div className="reader-column">
            <ArticleHeader article={article} views={views} />
            {sections.map(s => (
              <section key={s.id} data-reader-section={s.id} className={`reader-section${s.id === active ? ' is-active' : ''}`}>
                <SectionView nodes={s.nodes} />
              </section>
            ))}
          </div>
        </div>
      )}
      right={(
        <Suspense fallback={<Loading label="Loading diagrams" />}>
          <Canvas initialScene={article.canvas} viewMode onApi={setApi} />
        </Suspense>
      )}
    />
  );
}

// ---------------------------------------------------------------- Present (one section per step)
function PresentMode({ article, sections, prefs, setPrefs, narrow }: {
  article: PublishedArticle; sections: Section[]; prefs: ReadPrefs; setPrefs: (p: ReadPrefs) => void; narrow: boolean;
}) {
  const [ratio, setRatio] = useStoredRatio('read');
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const step = Math.min(Math.max(prefs.step ?? 0, 0), Math.max(sections.length - 1, 0));
  const go = useCallback((n: number) => setPrefs({ step: Math.min(Math.max(n, 0), sections.length - 1) }), [sections.length, setPrefs]);
  const section = sections[step];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(step + 1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(step - 1); }
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, step]);

  useEffect(() => { if (api && section?.frameId) scrollToFrame(api, section.frameId); }, [api, section]);

  const text = (
    <div className="present-text" id="main">
      {step === 0 && <p className="present-kicker">{article.title}</p>}
      {section ? <SectionView key={section.id} nodes={section.nodes} /> : <p className="muted">This article is empty.</p>}
    </div>
  );
  const canvas = (
    <Suspense fallback={<Loading label="Loading diagrams" />}>
      <Canvas initialScene={article.canvas} viewMode onApi={setApi} />
    </Suspense>
  );
  return (
    <div className="present">
      {narrow
        ? <div className="present-stack"><div className="present-canvas">{canvas}</div>{text}</div>
        : <SplitPane ratio={ratio} onRatioChange={setRatio} leftLabel="Current section" rightLabel="Diagram" left={text} right={canvas} />}
      <nav className="present-nav" aria-label="Sections">
        <button type="button" className="icon-btn" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous section"><ChevronLeft size={20} /></button>
        <ol className="present-dots">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={i === step ? 'is-on' : ''} onClick={() => go(i)} aria-label={`${i + 1}. ${s.title}`} aria-current={i === step ? 'step' : undefined} />
            </li>
          ))}
        </ol>
        <span className="present-count">{sections.length ? step + 1 : 0} / {sections.length}</span>
        <button type="button" className="icon-btn" onClick={() => go(step + 1)} disabled={step >= sections.length - 1} aria-label="Next section"><ChevronRight size={20} /></button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- Article (classic vertical)
function ArticleMode({ article, sections, views, onOpen }: {
  article: PublishedArticle; sections: Section[]; views: number; onOpen?: (sectionId: string) => void;
}) {
  return (
    <main id="main" className="reader-article">
      <div className="reader-column">
        <ArticleHeader article={article} views={views} />
        {sections.map(s => (
          <section key={s.id} className="reader-section">
            <SectionView nodes={s.nodes} />
            {s.frameId && (
              <FrameFigure scene={article.canvas} frameId={s.frameId} caption={s.title} onOpen={onOpen ? () => onOpen(s.id) : undefined} />
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
