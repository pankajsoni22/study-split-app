import { GalleryHorizontal, Pin, PinOff, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import SlideImage from '../canvas/SlideImage.tsx';

export interface SlideRef { sectionId: string; title: string; frameId: string }

/** Where an unlinked slide goes: a new section, or an existing one (whose slide it replaces). */
export type LinkTarget = 'new' | { section: string };

interface StripProps {
  slides: SlideRef[];
  activeSectionId: string | null;
  /** Snapshot of the canvas (a new object after edits re-renders the thumbnails). */
  scene: CanvasScene;
  onSelect: (sectionId: string) => void;
  onAdd: () => void;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  /** Drawn slides no section points to: can be linked to a new or existing section, or deleted. */
  orphans: { frameId: string; title: string }[];
  onAdopt: (frameId: string, target: LinkTarget) => void;
  onDeleteOrphan: (frameId: string) => void;
}

const AUTO_HIDE_MS = 3000;
const LEAVE_HIDE_MS = 1200;

/**
 * Slides panel (decided 2026-11-22): a slim strip across the full width of the editor.
 * Unpinned, it hides behind a small floating "Splits" button: hover, focus or click to open; it closes
 * after a few seconds, when the pointer leaves, on a click outside, or with Esc. Pinned, it is docked
 * at the bottom of the editor and stays.
 */
export default function SlideStrip(props: StripProps) {
  return props.pinned ? <Strip {...props} docked /> : <FloatingStrip {...props} />;
}

function FloatingStrip(props: StripProps) {
  const [open, setOpen] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const inside = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const scheduleHide = useCallback((ms: number) => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (!inside.current) setOpen(false); }, ms);
  }, []);
  const show = useCallback(() => { setOpen(true); scheduleHide(AUTO_HIDE_MS); }, [scheduleHide]);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const index = props.slides.findIndex(s => s.sectionId === props.activeSectionId);
  return (
    <>
      <button ref={buttonRef} type="button" className={`slides-fab${open ? ' is-open' : ''}`} aria-expanded={open} aria-controls="slides-panel"
        onMouseEnter={show} onFocus={show} onClick={() => (open ? setOpen(false) : show())}
        title="Splits (hover to open)">
        <GalleryHorizontal size={16} aria-hidden="true" />
        Splits <span className="slides-fab-count">{props.slides.length ? `${Math.max(index, 0) + 1} / ${props.slides.length}` : '0'}</span>
      </button>
      {open && (
        <div ref={panelRef} id="slides-panel" className="slides-float"
          onMouseEnter={() => { inside.current = true; window.clearTimeout(hideTimer.current); }}
          onMouseLeave={() => { inside.current = false; scheduleHide(LEAVE_HIDE_MS); }}
          onFocus={() => { inside.current = true; }} onBlur={() => { inside.current = false; scheduleHide(LEAVE_HIDE_MS); }}>
          <Strip {...props} docked={false} />
        </div>
      )}
    </>
  );
}

function Strip({ slides, activeSectionId, scene, onSelect, onAdd, pinned, onPinnedChange, orphans, onAdopt, onDeleteOrphan, docked }: StripProps & { docked: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  // Keep the current split's thumbnail in view by scrolling ONLY this list (scrollIntoView could also scroll other
  // areas and cancel the editor's smooth jump to that split).
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !el) return;
    const lr = list.getBoundingClientRect(), er = el.getBoundingClientRect();
    const l = er.left - lr.left + list.scrollLeft, r = l + er.width;
    if (l < list.scrollLeft) list.scrollLeft = l - 8;
    else if (r > list.scrollLeft + list.clientWidth) list.scrollLeft = r - list.clientWidth + 8;
  }, [activeSectionId]);
  // Hover (or keyboard focus) on a split shows a bigger preview of its drawing above the panel (2026-11-28).
  const [peek, setPeek] = useState<{ index: number; top: number; left: number } | null>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const startPeek = (index: number, el: HTMLElement) => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => {
      const box = el.getBoundingClientRect();
      setPeek({ index, top: Math.max(8, box.top - PEEK_HEIGHT - 12), left: Math.max(8, Math.min(box.left + box.width / 2 - PEEK_WIDTH / 2, window.innerWidth - PEEK_WIDTH - 8)) });
    }, 250);
  };
  const stopPeek = () => { window.clearTimeout(peekTimer.current); setPeek(null); };
  const peeked = peek ? slides[peek.index] : undefined;

  return (
    <nav className={`slide-strip${docked ? ' is-docked' : ''}`} aria-label="Splits">
      <ol ref={listRef}>
        {slides.map((s, i) => {
          const active = s.sectionId === activeSectionId;
          return (
            <li key={s.sectionId}>
              <button type="button" className={`slide-thumb${active ? ' is-on' : ''}`} aria-current={active}
                onClick={() => { stopPeek(); onSelect(s.sectionId); }} aria-label={`${i + 1}. ${s.title}`}
                onMouseEnter={e => startPeek(i, e.currentTarget)} onMouseLeave={stopPeek}
                onFocus={e => startPeek(i, e.currentTarget)} onBlur={stopPeek}>
                <span className="slide-thumb-box">
                  <SlideImage scene={scene} frameId={s.frameId} label={s.title} className="is-thumb" />
                </span>
                <span className="slide-thumb-label"><b>{i + 1}</b> {s.title}</span>
              </button>
            </li>
          );
        })}
        {orphans.length > 0 && (
          <li className="orphan-head" aria-label="Drawings not linked to a split">
            <span>Unlinked<br />drawings</span>
          </li>
        )}
        {orphans.map(o => (
          <li key={o.frameId}>
            <OrphanSlide orphan={o} slides={slides} scene={scene} onAdopt={onAdopt} onDelete={onDeleteOrphan} />
          </li>
        ))}
        <li>
          <button type="button" className="slide-add" onClick={onAdd} title="Add a new split (heading + drawing) after the current one">
            <Plus size={16} aria-hidden="true" />
            <span>Add split</span>
          </button>
        </li>
      </ol>
      {peek && peeked && (
        <div className="slide-peek" style={{ top: peek.top, left: peek.left }} aria-hidden="true">
          <SlideImage scene={scene} frameId={peeked.frameId} label={peeked.title} className="is-peek" />
          <span className="slide-peek-label"><b>{peek.index + 1}.</b> {peeked.title}</span>
        </div>
      )}
      <button type="button" className="icon-btn icon-btn-plain strip-pin" onClick={() => onPinnedChange(!pinned)}
        aria-pressed={pinned} title={pinned ? 'Unpin: hide the splits behind a button' : 'Pin: keep the splits visible'}>
        {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
        <span className="visually-hidden">{pinned ? 'Unpin splits' : 'Pin splits'}</span>
      </button>
    </nav>
  );
}

const PEEK_WIDTH = 340;
const PEEK_HEIGHT = 300;
const MENU_PREVIEW = 170;
const MENU_MAX = 520;

/** An unlinked slide: hover to preview it, click to link it to a new or existing section; ✕ deletes it. */
function OrphanSlide({ orphan, slides, scene, onAdopt, onDelete }: {
  orphan: { frameId: string; title: string };
  slides: SlideRef[];
  scene: CanvasScene;
  onAdopt: (frameId: string, target: LinkTarget) => void;
  onDelete: (frameId: string) => void;
}) {
  const [menu, setMenu] = useState<{ top: number; left: number } | null>(null);
  /** Large hover preview (after a short pause, so moving across the strip doesn't flash previews). */
  const [peek, setPeek] = useState<{ top: number; left: number } | null>(null);
  const peekTimer = useRef<number | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);
  const startPeek = () => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => {
      const box = ref.current?.getBoundingClientRect();
      if (box) setPeek({ top: Math.max(8, box.top - PEEK_HEIGHT - 12), left: Math.max(8, Math.min(box.left - 120, window.innerWidth - PEEK_WIDTH - 8)) });
    }, 350);
  };
  const stopPeek = () => { window.clearTimeout(peekTimer.current); setPeek(null); };
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  const open = () => {
    stopPeek();
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const height = Math.min(MENU_MAX, 92 + MENU_PREVIEW + slides.length * 34);
    setMenu(m => (m ? null : { top: Math.max(8, box.top - height - 8), left: Math.max(8, Math.min(box.left, window.innerWidth - 280)) }));
  };
  const pick = (target: LinkTarget) => { setMenu(null); onAdopt(orphan.frameId, target); };

  return (
    <div className="orphan" ref={ref}>
      <button type="button" className="slide-thumb is-orphan" onClick={open} aria-haspopup="menu" aria-expanded={!!menu}
        onMouseEnter={() => { if (!menu) startPeek(); }} onMouseLeave={stopPeek} onFocus={() => { if (!menu) startPeek(); }} onBlur={stopPeek}
        title={`"${orphan.title}" has drawings but no section uses it. Click to link it to a section.`}>
        <span className="slide-thumb-box">
          <SlideImage scene={scene} frameId={orphan.frameId} label={orphan.title} className="is-thumb" />
        </span>
        <span className="slide-thumb-label">{orphan.title}</span>
      </button>
      <button type="button" className="orphan-delete" aria-label={`Delete unlinked drawing "${orphan.title}"`} title="Delete this unlinked drawing"
        onClick={() => { if (window.confirm(`Delete the unlinked drawing "${orphan.title}" and everything drawn on it?`)) onDelete(orphan.frameId); }}>
        <X size={12} aria-hidden="true" />
      </button>
      {peek && !menu && (
        <div className="slide-peek" style={peek} aria-hidden="true">
          <SlideImage scene={scene} frameId={orphan.frameId} label={orphan.title} className="is-peek" />
          <span className="slide-peek-label">{orphan.title} · not used by any section</span>
        </div>
      )}
      {menu && (
        <div className="orphan-menu" role="menu" style={menu} aria-label={`Link "${orphan.title}"`}>
          <div className="orphan-menu-preview">
            <SlideImage scene={scene} frameId={orphan.frameId} label={orphan.title} className="is-peek" />
          </div>
          <p className="orphan-menu-title">Link “{orphan.title}” to…</p>
          <button type="button" role="menuitem" className="orphan-menu-item is-new" onClick={() => pick('new')}>
            <Plus size={15} aria-hidden="true" /> A new section
          </button>
          {slides.length > 0 && <p className="orphan-menu-sub">An existing section (replaces its slide)</p>}
          <div className="orphan-menu-list">
            {slides.map((sl, i) => (
              <button key={sl.sectionId} type="button" role="menuitem" className="orphan-menu-item" onClick={() => pick({ section: sl.sectionId })}>
                <b>{i + 1}</b> {sl.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
