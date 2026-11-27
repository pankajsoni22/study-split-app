import { ArrowUp, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Clock, Columns2, Eye, Layers, ListTree, PenLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { splitSections, textOf, type Section } from '../../domain/content.ts';
import { stepIds, usesUnfold, visibleAt } from '../../domain/unfold.ts';
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

type Mode = 'flow' | 'article';
interface ReadPrefs { mode?: Mode | 'present'; sectionId?: string; layout?: LayoutId; unfold?: boolean }

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

  // Two views (Present was removed 2026-11-27): Split (one split at a time, text beside its drawing) and Article.
  const mode: Mode = narrow || prefs.mode === 'article' ? 'article' : 'flow';
  const sections = useMemo<Section[]>(() => splitSections(article.doc), [article.doc]);
  // Unfold (experimental): offered when the writer built the drawings paragraph by paragraph; on by default.
  const canUnfold = useMemo(() => usesUnfold(article.canvas), [article.canvas]);
  const unfold = canUnfold && prefs.unfold !== false && mode !== 'article';
  const [views, setViews] = useState(article.views);
  const authorLayout = layoutById(article.canvas.layout).id;
  const layout = layoutById(prefs.layout ?? authorLayout).id;

  /** The split being read: shown alone in Split view; the one in view in Article view (drives Contents). */
  const firstId = sections[0]?.id ?? null;
  const [current, setCurrent] = useState<string | null>(() => (sections.some(x => x.id === prefs.sectionId) ? prefs.sectionId! : firstId));
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setPrefs({ sectionId: current }), 300);
    return () => window.clearTimeout(t);
  }, [current, setPrefs]);

  /** A jump request (Contents, Previous/Next, keys): which split, and optionally which sub-heading in it. */
  const [jump, setJump] = useState<Jump | null>(null);
  const jumpTo = useCallback((sectionId: string, sub: number | null = null) => {
    setCurrent(sectionId);
    setJump(j => ({ sectionId, sub, n: (j?.n ?? 0) + 1 }));
  }, []);

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
            {close => <Contents sections={sections} current={current} onPick={(id, sub) => { close(); jumpTo(id, sub); }} menu />}
          </MenuButton>
        )}
        {canUnfold && mode !== 'article' && (
          <button type="button" className={`btn btn-ghost btn-sm unfold-toggle${unfold ? ' is-on' : ''}`} aria-pressed={unfold}
            title={unfold ? 'Unfold is on: each drawing builds up as you read. Click to show whole drawings.' : 'Unfold: build each drawing up paragraph by paragraph'}
            onClick={() => setPrefs({ unfold: !unfold })}>
            <Layers size={15} aria-hidden="true" /><span className="hide-narrow">Unfold</span>
          </button>
        )}
        {!narrow && (
          <div className="segmented segmented-sm" role="radiogroup" aria-label="Reading mode">
            <ModeButton current={mode} value="flow" label="Split" Icon={Columns2} onPick={m => setPrefs({ mode: m })} />
            <ModeButton current={mode} value="article" label="Article" Icon={BookOpen} onPick={m => setPrefs({ mode: m })} />
          </div>
        )}
        {!narrow && mode !== 'article' && (
          <LayoutPicker value={layout} onChange={l => setPrefs({ layout: l })} label="Layout (text : drawing)" />
        )}
        {!narrow && <ThemeSwitch compact />}
        {article.isOwner && !narrow && (
          <Link className="btn btn-ghost btn-sm" to={`/write/${article.id}`}><PenLine size={15} aria-hidden="true" /> Edit</Link>
        )}
      </header>
      {mode === 'flow' && (
        <FlowMode article={article} sections={sections} views={views} current={current ?? firstId} jump={jump} onGo={jumpTo}
          setPrefs={setPrefs} layout={layout} authorLayout={authorLayout} unfold={unfold} />
      )}
      {mode === 'article' && (
        <ArticleMode article={article} sections={sections} views={views} jump={jump} current={current} onActive={setCurrent} onJump={jumpTo}
          onOpen={narrow ? undefined : sectionId => { setCurrent(sectionId); setPrefs({ mode: 'flow', sectionId }); }} />
      )}
    </div>
  );
}

interface Jump { sectionId: string; sub: number | null; n: number }

/** Sub-headings (H3) of a split, for Contents. */
function subHeadings(section: Section): string[] {
  return section.nodes.filter(n => n.type === 'heading' && n.attrs?.level === 3).map(n => textOf(n).trim() || 'Untitled');
}

/** Contents: every split; the current one expands to show its sub-headings. Used in the reader bar menu and Article view. */
function Contents({ sections, current, onPick, menu = false }: {
  sections: Section[]; current: string | null; onPick: (sectionId: string, sub: number | null) => void; menu?: boolean;
}) {
  return (
    <ol className={`contents${menu ? ' contents-menu' : ''}`}>
      {sections.map((sec, i) => {
        const on = sec.id === current;
        const subs = on ? subHeadings(sec) : [];
        return (
          <li key={sec.id} className={on ? 'is-current' : ''}>
            <button type="button" role={menu ? 'menuitem' : undefined} className={`contents-split${on ? ' is-on' : ''}`}
              aria-current={on ? 'location' : undefined} onClick={() => onPick(sec.id, null)}>
              <span className="contents-num">{i + 1}</span><span className="contents-title">{sec.title}</span>
            </button>
            {subs.length > 0 && (
              <ol className="contents-subs">
                {subs.map((t, j) => (
                  <li key={j}>
                    <button type="button" role={menu ? 'menuitem' : undefined} className="contents-sub" onClick={() => onPick(sec.id, j)}>{t}</button>
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Scrolls a split (and optionally its n-th sub-heading) into view inside `root`. */
function scrollToTarget(root: HTMLElement | null, sectionId: string, sub: number | null, behavior: ScrollBehavior) {
  const sec = root?.querySelector<HTMLElement>(`[data-reader-section="${CSS.escape(sectionId)}"]`);
  if (!root || !sec) return;
  const target = sub === null ? sec : sec.querySelectorAll<HTMLElement>('.ProseMirror > h3')[sub] ?? sec;
  target.scrollIntoView({ behavior, block: 'start' });
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

// ---------------------------------------------------------------- Split view: one split at a time (2026-11-27)
function FlowMode({ article, sections, views, current, jump, onGo, setPrefs, layout, authorLayout, unfold }: {
  article: PublishedArticle; sections: Section[]; views: number; current: string | null; jump: Jump | null;
  onGo: (sectionId: string, sub?: number | null) => void; setPrefs: (p: ReadPrefs) => void;
  layout: LayoutId; authorLayout: LayoutId; unfold: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const index = Math.max(0, sections.findIndex(s => s.id === current));
  const section = sections[index];
  const prev = sections[index - 1], next = sections[index + 1];

  // A new split starts at its top; a jump to a sub-heading scrolls to it.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !section) return;
    if (jump && jump.sectionId === section.id && jump.sub !== null) scrollToTarget(root, section.id, jump.sub, 'smooth');
    else root.scrollTop = 0;
  }, [section, jump]);

  // [ and ] (or Alt+← / Alt+→): previous / next split.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey) return;
      const back = e.key === '[' || (e.altKey && e.key === 'ArrowLeft');
      const fwd = e.key === ']' || (e.altKey && e.key === 'ArrowRight');
      if (back && prev) { e.preventDefault(); onGo(prev.id); }
      if (fwd && next) { e.preventDefault(); onGo(next.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onGo]);

  // Unfold: the paragraph at the reading line (38% down the text pane) is the current step.
  const [step, setStep] = useState<{ sectionId: string; index: number } | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const clear = () => {
      root.querySelectorAll('.is-unfold-current').forEach(el => el.classList.remove('is-unfold-current'));
      root.classList.remove('has-unfold-current');
    };
    if (!unfold || !section) { clear(); return; }
    let raf = 0;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const line = box.top + box.height * 0.38;
      const blocks = [...root.querySelectorAll<HTMLElement>('.ProseMirror > [data-block-id], .ProseMirror > .tableWrapper')];
      const current = blocks.filter(el => el.getBoundingClientRect().top <= line).pop() ?? null;
      root.querySelectorAll('.is-unfold-current').forEach(el => { if (el !== current) el.classList.remove('is-unfold-current'); });
      current?.classList.add('is-unfold-current');
      root.classList.toggle('has-unfold-current', !!current);
      const id = current?.getAttribute('data-block-id') ?? current?.querySelector('[data-block-id]')?.getAttribute('data-block-id') ?? null;
      const at = id ? stepIds(section.nodes).indexOf(id) : -1;
      setStep(p => (p?.sectionId === section.id && p.index === at ? p : { sectionId: section.id, index: at }));
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    raf = requestAnimationFrame(measure);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => { root.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); clear(); };
  }, [unfold, section]);

  const slide = slideFor(sections, index);
  const parts = useMemo(() => {
    if (!unfold || !slide?.frameId || !section) return undefined;
    // The split has its own drawing: build it up to the current step. (A split without one shows the earlier drawing whole.)
    const own = section.frameId === slide.frameId;
    const at = own && step?.sectionId === section.id ? step.index : own ? -1 : Number.MAX_SAFE_INTEGER;
    return visibleAt(article.canvas.elements, slide.frameId, stepIds(slide.nodes), at);
  }, [unfold, slide, section, step, article.canvas.elements]);

  if (!section) return null;
  return (
    <SplitPane layout={layout} defaultLayout={authorLayout} onLayoutChange={l => setPrefs({ layout: l })} leftLabel="Article text" rightLabel="Drawing"
      left={(
        <div ref={scrollRef} className={`reader-scroll${unfold ? ' is-unfolding' : ''}`} id="main">
          <div className="reader-column">
            {index === 0 ? <ArticleHeader article={article} views={views} /> : prev && (
              <button type="button" className="prev-split" onClick={() => onGo(prev.id)} title="Previous split ([)">
                <ChevronLeft size={15} aria-hidden="true" /> {index}. {prev.title}
              </button>
            )}
            <section key={section.id} data-reader-section={section.id} className="reader-section is-active">
              <SectionView nodes={section.nodes} />
            </section>
            <nav className="split-end" aria-label="Next split">
              {next ? (
                <button type="button" className="next-split-cta" onClick={() => onGo(next.id)} title="Next split (])">
                  <span className="next-split-label">Next split</span>
                  <span className="next-split-title">{index + 2}. {next.title}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : (
                <p className="split-end-note">End of the article · {sections.length} splits</p>
              )}
              <span className="split-end-count">Split {index + 1} of {sections.length}</span>
            </nav>
          </div>
        </div>
      )}
      right={<SlideStage scene={article.canvas} frameId={slide?.frameId ?? null} label={slide?.title ?? ''} only={parts?.visible} fresh={parts?.fresh} />}
    />
  );
}

// ---------------------------------------------------------------- Article (classic vertical)
function ArticleMode({ article, sections, views, onOpen, jump, current, onActive, onJump }: {
  article: PublishedArticle; sections: Section[]; views: number; onOpen?: (sectionId: string) => void;
  jump: Jump | null; current: string | null; onActive: (sectionId: string) => void; onJump: (sectionId: string, sub?: number | null) => void;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const active = current;
  const setActive = onActive;
  const [progress, setProgress] = useState(0);

  // Jumps from Contents (bar menu or the list on the left): to a split or one of its sub-headings.
  useEffect(() => {
    if (jump) scrollToTarget(mainRef.current, jump.sectionId, jump.sub, 'smooth');
  }, [jump]);

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
  }, [sections, setActive]);

  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget, max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? el.scrollTop / max : 0);
  };
  const goTo = (id: string) => onJump(id);

  return (
    <main id="main" ref={mainRef} className="reader-article" onScroll={onScroll}>
      <div className="reading-progress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>
      <div className="article-layout">
        {sections.length > 1 && (
          <nav className="article-toc" aria-label="Splits in this article">
            <p className="article-toc-title">Splits</p>
            <Contents sections={sections} current={active} onPick={onJump} />
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
                <button type="button" className="next-split" onClick={() => goTo(sections[i + 1]!.id)}>
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
