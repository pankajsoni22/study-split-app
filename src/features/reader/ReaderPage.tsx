import { ArrowUp, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Clock, Columns2, Eye, ListTree, PenLine, Presentation } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { splitSections, type Section } from '../../domain/content.ts';
import { layoutById, type LayoutId } from '../../domain/layouts.ts';
import type { PublishedArticle } from '../../domain/types.ts';
import { getServices } from '../../data/services.ts';
import { useQuery } from '../../data/useQuery.ts';
import { readJson, writeJson } from '../../lib/storage.ts';
import { formatCount, formatDate } from '../../lib/text.ts';
import { useIsNarrow } from '../../lib/useMediaQuery.ts';
import { shouldRecordView } from '../../lib/viewCounter.ts';
import Avatar from '../../ui/Avatar.tsx';
import LayoutPicker from '../../ui/LayoutPicker.tsx';
import MenuButton from '../../ui/MenuButton.tsx';
import Logo from '../../ui/Logo.tsx';
import SplitPane from '../../ui/SplitPane.tsx';
import { ErrorState, Loading } from '../../ui/States.tsx';
import ThemeSwitch from '../../ui/ThemeSwitch.tsx';
import SlideImage from '../canvas/SlideImage.tsx';
import SlideStage from '../canvas/SlideStage.tsx';
import SectionView from './SectionView.tsx';

type Mode = 'flow' | 'present' | 'article';
interface ReadPrefs { mode?: Mode; sectionId?: string; step?: number; layout?: LayoutId }

/** The slide shown with a section: its own, else the closest earlier one, else the first slide. */
function slideFor(sections: Section[], index: number): Section | null {
  for (let i = Math.min(index, sections.length - 1); i >= 0; i--) if (sections[i]?.frameId) return sections[i]!;
  return sections.find(s => s.frameId) ?? null;
}

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
  const sections = useMemo<Section[]>(() => splitSections(article.doc), [article.doc]);
  const [views, setViews] = useState(article.views);
  const authorLayout = layoutById(article.canvas.layout).id;
  const layout = layoutById(prefs.layout ?? authorLayout).id;

  /** Jump to a split: Present mode shows it; the scrolling modes bring its heading to the top. */
  const jumpTo = useCallback((sectionId: string) => {
    if (mode === 'present') { setPrefs({ step: Math.max(0, sections.findIndex(s => s.id === sectionId)) }); return; }
    document.querySelector(`[data-reader-section="${CSS.escape(sectionId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [mode, sections, setPrefs]);

  // FR-24: one view per browser per article per day. Fire and forget.
  useEffect(() => {
    if (shouldRecordView(article.id)) getServices().articles.recordView(article.id).then(n => { if (n > 0) setViews(n); }, () => {});
  }, [article.id]);

  return (
    <div className="reader-page">
      <header className="reader-bar">
        <Link to="/" className="reader-home" aria-label="Study Split home"><Logo size={28} /></Link>
        <span className="reader-bar-title" title={article.title}>{article.title}</span>
        <span className="editor-bar-spacer" />
        {sections.length > 1 && (
          <MenuButton label="Contents: jump to a split" buttonClassName="btn btn-ghost btn-sm reader-contents-btn"
            trigger={<><ListTree size={15} aria-hidden="true" /><span className="hide-narrow">Contents</span><ChevronDown size={14} aria-hidden="true" /></>}>
            {close => (
              <ol className="contents-menu">
                {sections.map((sec, i) => (
                  <li key={sec.id}>
                    <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); jumpTo(sec.id); }}>
                      <span className="contents-num">{i + 1}</span><span className="menu-item-text">{sec.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </MenuButton>
        )}
        <div className="segmented segmented-sm" role="radiogroup" aria-label="Reading mode">
          {!narrow && <ModeButton current={mode} value="flow" label="Split" Icon={Columns2} onPick={m => setPrefs({ mode: m })} />}
          <ModeButton current={mode} value="present" label="Present" Icon={Presentation} onPick={m => setPrefs({ mode: m })} />
          <ModeButton current={mode} value="article" label="Article" Icon={BookOpen} onPick={m => setPrefs({ mode: m })} />
        </div>
        {!narrow && mode !== 'article' && (
          <LayoutPicker value={layout} onChange={l => setPrefs({ layout: l })} label="Layout (text : drawing)" />
        )}
        {!narrow && <ThemeSwitch compact />}
        {article.isOwner && !narrow && (
          <Link className="btn btn-ghost btn-sm" to={`/write/${article.id}`}><PenLine size={15} aria-hidden="true" /> Edit</Link>
        )}
      </header>
      {mode === 'flow' && <FlowMode article={article} sections={sections} views={views} prefs={prefs} setPrefs={setPrefs} layout={layout} authorLayout={authorLayout} />}
      {mode === 'present' && <PresentMode article={article} sections={sections} prefs={prefs} setPrefs={setPrefs} narrow={narrow} layout={layout} authorLayout={authorLayout} />}
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
function FlowMode({ article, sections, views, prefs, setPrefs, layout, authorLayout }: {
  article: PublishedArticle; sections: Section[]; views: number; prefs: ReadPrefs; setPrefs: (p: ReadPrefs) => void;
  layout: LayoutId; authorLayout: LayoutId;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(prefs.sectionId ?? sections[0]?.id ?? null);
  const restored = useRef(false);

  // Restore the last position (section-anchored, so it survives font/screen changes).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (prefs.sectionId) scrollRef.current?.querySelector(`[data-reader-section="${CSS.escape(prefs.sectionId)}"]`)?.scrollIntoView({ block: 'start' });
  }, [prefs.sectionId]);

  // The section crossing the upper third of the text pane is "active"; its slide is shown.
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

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setPrefs({ sectionId: active }), 400);
    return () => window.clearTimeout(t);
  }, [active, setPrefs]);

  const slide = slideFor(sections, Math.max(0, sections.findIndex(s => s.id === active)));
  return (
    <SplitPane layout={layout} defaultLayout={authorLayout} onLayoutChange={l => setPrefs({ layout: l })} leftLabel="Article text" rightLabel="Drawing"
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
      right={<SlideStage scene={article.canvas} frameId={slide?.frameId ?? null} label={slide?.title ?? ''} />}
    />
  );
}

// ---------------------------------------------------------------- Present (one section per step)
function PresentMode({ article, sections, prefs, setPrefs, narrow, layout, authorLayout }: {
  article: PublishedArticle; sections: Section[]; prefs: ReadPrefs; setPrefs: (p: ReadPrefs) => void; narrow: boolean;
  layout: LayoutId; authorLayout: LayoutId;
}) {
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


  const text = (
    <div className="present-text" id="main">
      {step === 0 && <p className="present-kicker">{article.title}</p>}
      {section ? <SectionView key={section.id} nodes={section.nodes} /> : <p className="muted">This article is empty.</p>}
    </div>
  );
  const slide = slideFor(sections, step);
  const canvas = <SlideStage scene={article.canvas} frameId={slide?.frameId ?? null} label={slide?.title ?? ''} />;
  return (
    <div className="present">
      {narrow
        ? <div className="present-stack"><div className="present-canvas">{canvas}</div>{text}</div>
        : <SplitPane layout={layout} defaultLayout={authorLayout} onLayoutChange={l => setPrefs({ layout: l })}
            leftLabel="Current split" rightLabel="Drawing" left={text} right={canvas} />}
      <nav className="present-nav" aria-label="Splits">
        <button type="button" className="icon-btn" onClick={() => go(step - 1)} disabled={step === 0} aria-label="Previous split"><ChevronLeft size={20} /></button>
        <ol className="present-dots">
          {sections.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={i === step ? 'is-on' : ''} onClick={() => go(i)} aria-label={`${i + 1}. ${s.title}`} aria-current={i === step ? 'step' : undefined} />
            </li>
          ))}
        </ol>
        <span className="present-count">{sections.length ? step + 1 : 0} / {sections.length}</span>
        <button type="button" className="icon-btn" onClick={() => go(step + 1)} disabled={step >= sections.length - 1} aria-label="Next split"><ChevronRight size={20} /></button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------- Article (classic vertical)
function ArticleMode({ article, sections, views, onOpen }: {
  article: PublishedArticle; sections: Section[]; views: number; onOpen?: (sectionId: string) => void;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const [progress, setProgress] = useState(0);

  // Which split is being read: the one crossing the upper part of the window.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const io = new IntersectionObserver(entries => {
      const hit = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      const id = hit?.target.getAttribute('data-reader-section');
      if (id) setActive(id);
    }, { root, rootMargin: '-12% 0px -70% 0px' });
    root.querySelectorAll('[data-reader-section]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget, max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? el.scrollTop / max : 0);
  };
  const jump = (id: string) => mainRef.current?.querySelector(`[data-reader-section="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <main id="main" ref={mainRef} className="reader-article" onScroll={onScroll}>
      <div className="reading-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
      <div className="article-layout">
        {sections.length > 1 && (
          <nav className="article-toc" aria-label="Splits in this article">
            <p className="article-toc-title">Splits</p>
            <ol>
              {sections.map((s, i) => (
                <li key={s.id}>
                  <button type="button" className={s.id === active ? 'is-on' : ''} aria-current={s.id === active ? 'location' : undefined} onClick={() => jump(s.id)}>
                    <span className="contents-num">{i + 1}</span><span>{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="reader-column">
          <ArticleHeader article={article} views={views} />
          {sections.map((s, i) => (
            <section key={s.id} data-reader-section={s.id} className="reader-section">
              <SectionView nodes={s.nodes} />
              {s.frameId && (
                <figure className="slide-figure">
                  <SlideImage scene={article.canvas} frameId={s.frameId} label={s.title} />
                  {onOpen && (
                    <figcaption><button type="button" className="link-button" onClick={() => onOpen(s.id)}>Read beside the text →</button></figcaption>
                  )}
                </figure>
              )}
              {i < sections.length - 1 && (
                <button type="button" className="next-split" onClick={() => jump(sections[i + 1]!.id)}>
                  Next split <span>{i + 2}. {sections[i + 1]!.title}</span> <ChevronDown size={15} aria-hidden="true" />
                </button>
              )}
            </section>
          ))}
        </div>
      </div>
      {progress > 0.08 && (
        <button type="button" className="back-to-top" aria-label="Back to top" title="Back to top"
          onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      )}
    </main>
  );
}
