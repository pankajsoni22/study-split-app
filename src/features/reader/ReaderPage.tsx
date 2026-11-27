import { ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Columns2, Eye, Layers, Link2, ListTree, PenLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { splitSections, textOf, type Section } from '../../domain/content.ts';
import { slugify } from '../../domain/slug.ts';
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
/** Where the reader was in Split view: the split, the paragraph (or 'prev' / 'next' button) and its distance from the top. */
interface ReadPlace { sectionId: string; blockId: string; offset: number }
interface ReadPrefs { mode?: Mode | 'present'; sectionId?: string; layout?: LayoutId; unfold?: boolean; place?: ReadPlace }

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
  // A shared link (#split-3-title) opens that split, ahead of where this browser last was.
  const [linked] = useState<string | null>(() => splitFromHash(sections, window.location.hash));
  const [current, setCurrent] = useState<string | null>(() => linked ?? (sections.some(x => x.id === prefs.sectionId) ? prefs.sectionId! : firstId));
  // The address bar always names the current split, so copying it shares that split.
  useEffect(() => {
    const i = sections.findIndex(x => x.id === current);
    if (i < 0) return;
    const hash = splitHash(i, sections[i]!);
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash);
  }, [current, sections]);
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(() => setPrefs({ sectionId: current }), 300);
    return () => window.clearTimeout(t);
  }, [current, setPrefs]);

  const currentIndex = Math.max(0, sections.findIndex(x => x.id === current));
  const currentSection = sections[currentIndex];

  /** A jump request (Contents, Previous/Next, keys): which split, and optionally which sub-heading in it. */
  // A link to the split this browser was already reading (e.g. a refresh keeps #split-… in the address bar) resumes the
  // exact place in it; a link to another split opens that split at its start.
  const resumeLinked = !!linked && mode === 'flow' && prefs.place?.sectionId === linked;
  const [jump, setJump] = useState<Jump | null>(() => (linked && !resumeLinked ? { sectionId: linked, sub: null, n: 1 } : null));
  const jumpTo = useCallback((sectionId: string, sub: number | null = null, arrive: 'start' | 'end' = 'start') => {
    setCurrent(sectionId);
    setJump(j => ({ sectionId, sub, arrive, n: (j?.n ?? 0) + 1 }));
  }, []);

  // FR-24: one view per browser per article per day. Fire and forget.
  useEffect(() => {
    if (shouldRecordView(article.id)) getServices().articles.recordView(article.id).then(n => { if (n > 0) setViews(n); }, () => {});
  }, [article.id]);

  return (
    <div className="reader-page">
      <header className="reader-bar">
        <Link to="/" className="reader-home" aria-label="Study Split home"><Logo size={28} /></Link>
        {/* Breadcrumb (2026-11-27): the article, then the current split, which is also the Contents menu. */}
        <nav className="reader-crumbs" aria-label="You are reading">
          <span className="reader-bar-title" title={article.title}>{article.title}</span>
          {sections.length > 1 && currentSection && (
            <>
              <ChevronRight size={15} className="crumb-sep" aria-hidden="true" />
              <MenuButton label={`Contents: you are on split ${currentIndex + 1} of ${sections.length}, ${currentSection.title}. Jump to another split`}
                align="left" buttonClassName="crumb-split"
                trigger={(
                  <>
                    <ListTree size={14} aria-hidden="true" className="crumb-icon" />
                    <span className="crumb-num">{currentIndex + 1}<small>/{sections.length}</small></span>
                    <span className="crumb-title">{currentSection.title}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </>
                )}>
                {close => <Contents sections={sections} current={current} onPick={(id, sub) => { close(); jumpTo(id, sub); }} menu />}
              </MenuButton>
            </>
          )}
        </nav>
        <span className="editor-bar-spacer" />
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
        <FlowMode article={article} sections={sections} views={views} current={current ?? firstId} jump={jump} onGo={jumpTo} place={!linked || resumeLinked ? prefs.place : undefined}
          setPrefs={setPrefs} layout={layout} authorLayout={authorLayout} unfold={unfold} />
      )}
      {mode === 'article' && (
        <ArticleMode article={article} sections={sections} views={views} jump={jump} current={current} onActive={setCurrent} onJump={jumpTo}
          onOpen={narrow ? undefined : sectionId => { setCurrent(sectionId); setPrefs({ mode: 'flow', sectionId }); }} />
      )}
    </div>
  );
}

/** `arrive: 'end'` = going back: open the split at its end (its last paragraph), mirroring going forward. */
interface Jump { sectionId: string; sub: number | null; arrive?: 'start' | 'end'; n: number }

/** `#split-3-finding-a-keys-server`: number for humans, title so the link survives reordering. */
const splitSlug = (title: string) => slugify(title.replace(/['’]/g, ''));   // "key's" → "keys", not "key-s"
function splitHash(index: number, section: Section): string {
  return `#split-${index + 1}-${splitSlug(section.title)}`;
}
function splitFromHash(sections: Section[], hash: string): string | null {
  const m = /^#split-(\d+)(?:-(.+))?$/.exec(hash);
  if (!m) return null;
  const bySlug = m[2] ? sections.find(x => splitSlug(x.title) === m[2]) : undefined;
  return (bySlug ?? sections[Number(m[1]) - 1])?.id ?? null;
}

/** "Copy link" to one split (shows "Copied ✓" for a moment). */
function CopySplitLink({ index, section, compact = false }: { index: number; section: Section; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = `${window.location.origin}${window.location.pathname}${splitHash(index, section)}`;
    void navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }, () => window.prompt('Copy this link', url));
  };
  return (
    <button type="button" className={`copy-split-link${copied ? ' is-copied' : ''}${compact ? ' is-compact' : ''}`} onClick={copy}
      title={`Copy a link to split ${index + 1}: ${section.title}`} aria-label={`Copy a link to split ${index + 1}`}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
      {!compact && <span>{copied ? 'Copied' : 'Copy link'}</span>}
    </button>
  );
}

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
function FlowMode({ article, sections, views, current, jump, onGo, place, setPrefs, layout, authorLayout, unfold }: {
  article: PublishedArticle; sections: Section[]; views: number; current: string | null; jump: Jump | null; place?: ReadPlace;
  onGo: (sectionId: string, sub?: number | null, arrive?: 'start' | 'end') => void; setPrefs: (p: ReadPrefs) => void;
  layout: LayoutId; authorLayout: LayoutId; unfold: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const index = Math.max(0, sections.findIndex(s => s.id === current));
  const section = sections[index];
  const prev = sections[index - 1], next = sections[index + 1];

  // Resume where the reader left off (2026-11-27): the saved place is used once, when the page opens on that split.
  const [restoreOnce] = useState<ReadPlace | undefined>(place);
  const restoreRef = useRef<ReadPlace | undefined>(restoreOnce);
  const anchorEl = useCallback((root: HTMLElement, blockId: string): HTMLElement | null => {
    if (blockId === 'prev') return root.querySelector<HTMLElement>('.prev-split');
    if (blockId === 'next') return root.querySelector<HTMLElement>('.next-split-cta');
    return root.querySelector<HTMLElement>(`.ProseMirror > [data-block-id="${CSS.escape(blockId)}"]`);
  }, []);
  /** Remember the place: the pointer's stop (Unfold) or the first paragraph in view, and how far down it sits. */
  const saveTimer = useRef(0);
  const rememberPlace = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const root = scrollRef.current;
      if (!root || !section) return;
      const top = root.getBoundingClientRect().top;
      const el = root.querySelector<HTMLElement>('.is-unfold-current')
        ?? [...root.querySelectorAll<HTMLElement>('.ProseMirror > [data-block-id]')].find(b => b.getBoundingClientRect().bottom > top + 1) ?? null;
      if (!el) return;
      const blockId = el.classList.contains('prev-split') ? 'prev' : el.classList.contains('next-split-cta') ? 'next' : el.getAttribute('data-block-id');
      if (!blockId) return;
      setPrefs({ place: { sectionId: section.id, blockId, offset: Math.round(el.getBoundingClientRect().top - top) } });
    }, 400);
  }, [section, setPrefs]);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    root.addEventListener('scroll', rememberPlace, { passive: true });
    return () => { root.removeEventListener('scroll', rememberPlace); window.clearTimeout(saveTimer.current); };
  }, [rememberPlace]);

  // A new split starts at its top; going back opens it at its end; a jump to a sub-heading scrolls to it.
  const arriveAtEnd = !!(jump && section && jump.sectionId === section.id && jump.arrive === 'end');
  const arriveAtEndRef = useRef(arriveAtEnd);
  useEffect(() => { arriveAtEndRef.current = arriveAtEnd; });   // declared first: runs before the effects below
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !section) return;
    const restore = !jump && restoreRef.current?.sectionId === section.id ? restoreRef.current : undefined;
    const el = restore ? anchorEl(root, restore.blockId) : null;
    if (jump && jump.sectionId === section.id && jump.sub !== null) scrollToTarget(root, section.id, jump.sub, 'smooth');
    else if (el && restore) root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top - restore.offset;
    else if (arriveAtEndRef.current) root.scrollTop = root.scrollHeight;
    else root.scrollTop = 0;
  }, [section, jump, anchorEl]);

  // [ and ] (or Alt+← / Alt+→): previous / next split.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey) return;
      const back = e.key === '[' || (e.altKey && e.key === 'ArrowLeft');
      const fwd = e.key === ']' || (e.altKey && e.key === 'ArrowRight');
      if (back && prev) { e.preventDefault(); onGo(prev.id, null, 'end'); }
      if (fwd && next) { e.preventDefault(); onGo(next.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onGo]);

  // Unfold: which paragraph is "current" (revised 2026-11-27: stepped, not free-running).
  // - Each wheel notch / ↓ / ↑ moves the pointer one paragraph (with a short pause between steps, so a fast trackpad
  //   swipe can't race ahead). The page does not scroll while the next paragraph is still in view; it scrolls only
  //   when the pointer reaches the bottom of the visible text.
  // - A paragraph taller than the pane scrolls normally until its end is visible, then stepping continues.
  // - At the last paragraph the wheel scrolls normally (to the Next split card); at the first, back to the top.
  // - Scroll bar drags and jumps place the pointer by position; clicking a paragraph makes it current.
  // Paragraphs after the current one fade; the ones already read stay clear.
  const [step, setStep] = useState<{ sectionId: string; index: number } | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const clear = () => {
      root.querySelectorAll('.is-unfold-current, .is-unfold-future').forEach(el => el.classList.remove('is-unfold-current', 'is-unfold-future'));
    };
    if (!unfold || !section) { clear(); return; }
    // Empty paragraphs (e.g. the editor's final empty line) are not reading steps.
    const paragraphsOf = () => [...root.querySelectorAll<HTMLElement>('.ProseMirror > [data-block-id], .ProseMirror > .tableWrapper')]
      .filter(el => (el.textContent ?? '').trim() !== '' || el.querySelector('img, svg, hr') || el.tagName === 'HR');
    // The pointer's stops: the "previous split" link, every paragraph, then the "Next split" card (Enter = click).
    const blocksOf = () => {
      const prevBtn = root.querySelector<HTMLElement>('.prev-split');
      const nextBtn = root.querySelector<HTMLElement>('.next-split-cta');
      return [...(prevBtn ? [prevBtn] : []), ...paragraphsOf(), ...(nextBtn ? [nextBtn] : [])];
    };
    const isButton = (el: HTMLElement | undefined) => !!el && el.tagName === 'BUTTON';
    let at = 0;                 // index into blocksOf()
    let quietUntil = 0;         // ignore position-based placement while our own / wheel scrolling settles
    let acc = 0, lastStep = 0, raf = 0;

    const apply = (i: number) => {
      const blocks = blocksOf();
      if (!blocks.length) return;
      at = Math.max(0, Math.min(i, blocks.length - 1));
      const cur = blocks[at]!;
      const onPrev = isButton(cur) && cur.classList.contains('prev-split');
      blocks.forEach((el, k) => {
        el.classList.toggle('is-unfold-current', k === at);
        el.classList.toggle('is-unfold-future', !onPrev && !isButton(el) && k > at);   // on "previous": nothing read yet, nothing faded
      });
      // The drawing: on "previous" nothing of this split yet; on "Next split" all of it.
      const id = isButton(cur) ? null : cur.getAttribute('data-block-id') ?? cur.querySelector('[data-block-id]')?.getAttribute('data-block-id') ?? null;
      const ids = stepIds(section.nodes);
      const index = onPrev ? -1 : isButton(cur) ? ids.length - 1 : id ? ids.indexOf(id) : -1;
      rememberPlace();
      setStep(p => (p?.sectionId === section.id && p.index === index ? p : { sectionId: section.id, index }));
    };
    const view = () => { const b = root.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: b.height }; };
    /** Scroll only if the current paragraph is (partly) out of view: bring it to ~30% from the top. */
    const keepInView = (el: HTMLElement) => {
      const v = view(), r = el.getBoundingClientRect();
      if (r.bottom <= v.bottom - 24 && r.top >= v.top + 8) return;
      quietUntil = Date.now() + 600;
      root.scrollBy({ top: r.top - (v.top + v.h * 0.3), behavior: 'smooth' });
    };
    /** Place the pointer by scroll position (scroll bar drags, jumps): the line runs from the split's start to its end. */
    const placeByPosition = () => {
      const all = blocksOf();
      const blocks = paragraphsOf();
      const max = root.scrollHeight - root.clientHeight;
      const line = (max > 0 ? root.scrollTop / max : 0) * root.scrollHeight;
      const top = view().top;
      let i = -1;
      blocks.forEach((el, k) => { if (el.getBoundingClientRect().top - top + root.scrollTop <= line + 1) i = k; });
      apply(all.indexOf(blocks[Math.max(0, i)]!));
    };
    const stepBy = (dir: 1 | -1): boolean => {
      const blocks = blocksOf();
      const cur = blocks[at];
      const v = view();
      if (!cur) return false;
      const r = cur.getBoundingClientRect();
      // A tall paragraph: scroll through it first.
      if (!isButton(cur) && dir === 1 && r.bottom > v.bottom - 10) return false;
      if (!isButton(cur) && dir === -1 && r.top < v.top - 10) return false;
      const next = at + dir;
      if (next < 0 || next >= blocks.length) return false;      // edges: normal scrolling
      apply(next);
      keepInView(blocks[next]!);
      return true;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;                                     // pinch-zoom
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * root.clientHeight : e.deltaY;
      const dir: 1 | -1 = dy > 0 ? 1 : -1;
      quietUntil = Date.now() + 450;
      const blocks = blocksOf();
      const cur = blocks[at];
      const v = view();
      const r = cur?.getBoundingClientRect();
      const tall = r && !isButton(cur) && (dir === 1 ? r.bottom > v.bottom - 10 : r.top < v.top - 10);
      const edge = dir === 1 ? at >= blocks.length - 1 : at <= 0;
      if (tall || edge) { acc = 0; return; }                    // let the page scroll normally
      e.preventDefault();
      acc += dy;
      const now = Date.now();
      if (Math.abs(acc) < 30 || now - lastStep < 260) return;
      acc = 0;
      lastStep = now;
      stepBy(dir);
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter') {
        if (t?.closest('button, a, [role="menu"]')) return;   // a focused control handles its own Enter
        const cur = blocksOf()[at];
        if (!cur) return;
        // Enter on the split buttons = click; on a collapsible = open / close it.
        const target = isButton(cur) ? cur : cur.matches('.collapsible, [data-type="details"]') ? cur.querySelector<HTMLElement>(':scope > button') : null;
        if (!target) return;
        e.preventDefault();
        // Opening / closing changes the page height and nudges the scroll: keep the pointer on this collapsible.
        if (!isButton(cur)) quietUntil = Date.now() + 900;
        target.click();
        if (!isButton(cur)) { const keep = at; requestAnimationFrame(() => apply(keep)); }
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      // Like the wheel: arrow-key scrolling never re-places the pointer by position (e.g. ↓ on the Next split card,
      // where there is nothing further to step to, must not send the pointer back up).
      quietUntil = Date.now() + 500;
      if (stepBy(e.key === 'ArrowDown' ? 1 : -1)) e.preventDefault();
    };
    const onScroll = () => {
      if (Date.now() < quietUntil) return;                       // our own scroll, or wheel scrolling at an edge / tall paragraph
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(placeByPosition);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('a, button, summary')) return;
      const i = blocksOf().findIndex(b => !isButton(b) && b.contains(t));
      if (i >= 0) apply(i);
    };

    // A split starts at its first paragraph; arriving from the next split (going back), at its last one; after a
    // refresh, where the reader left off.
    const restore = restoreRef.current?.sectionId === section.id ? restoreRef.current : undefined;
    const arriveEnd = arriveAtEndRef.current;
    if (arriveEnd || restore) quietUntil = Date.now() + 700;
    raf = requestAnimationFrame(() => {
      const paras = paragraphsOf();
      const restored = restore ? anchorEl(root, restore.blockId) : null;
      const start = restored ?? (arriveEnd ? paras[paras.length - 1] : paras[0]);
      apply(Math.max(0, blocksOf().indexOf(start!)));
    });
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      clear();
    };
  }, [unfold, section, anchorEl, rememberPlace]);
  // The saved place applies to the split it belongs to; forget it once the reader moves to another split. (Not cleared
  // right after use: React's development mode runs effects twice, and the second run must still find it.)
  useEffect(() => { if (restoreRef.current && restoreRef.current.sectionId !== section?.id) restoreRef.current = undefined; }, [section]);

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
            {index === 0 && <ArticleHeader article={article} views={views} />}
            <div className="split-top">
              {prev && (
                <button type="button" className="prev-split" onClick={() => onGo(prev.id, null, 'end')} title="Previous split ([)">
                  <ChevronLeft size={15} aria-hidden="true" /> {index}. {prev.title}
                  <kbd className="unfold-enter" aria-hidden="true">Enter ↵</kbd>
                </button>
              )}
              <CopySplitLink index={index} section={section} />
            </div>
            <section key={section.id} data-reader-section={section.id} className="reader-section is-active">
              <SectionView nodes={section.nodes} />
            </section>
            <nav className="split-end" aria-label="Next split">
              {next ? (
                <button type="button" className="next-split-cta" onClick={() => onGo(next.id)} title="Next split (])">
                  <span className="next-split-label">Next split</span>
                  <span className="next-split-title">{index + 2}. {next.title}</span>
                  <kbd className="unfold-enter" aria-hidden="true">Enter ↵</kbd>
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
            <section key={s.id} data-reader-section={s.id} className="reader-section has-copy-link">
              <CopySplitLink index={i} section={s} compact />
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
