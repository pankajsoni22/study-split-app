import { GalleryHorizontal, Pin, PinOff, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import SlideImage from '../canvas/SlideImage.tsx';

export interface SlideRef { sectionId: string; title: string; frameId: string }

interface StripProps {
  slides: SlideRef[];
  activeSectionId: string | null;
  /** Snapshot of the canvas (a new object after edits re-renders the thumbnails). */
  scene: CanvasScene;
  onSelect: (sectionId: string) => void;
  onAdd: () => void;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  /** Drawn slides no section points to: can be attached to the current section (recovery). */
  orphans: { frameId: string; title: string }[];
  onAdopt: (frameId: string) => void;
}

const AUTO_HIDE_MS = 3000;
const LEAVE_HIDE_MS = 1200;

/**
 * Slides panel (decided 2026-11-22): a slim strip across the full width of the editor.
 * Unpinned, it hides behind a small floating "Slides" button: hover, focus or click to open; it closes
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
        title="Slides (hover to open)">
        <GalleryHorizontal size={16} aria-hidden="true" />
        Slides <span className="slides-fab-count">{props.slides.length ? `${Math.max(index, 0) + 1} / ${props.slides.length}` : '0'}</span>
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

function Strip({ slides, activeSectionId, scene, onSelect, onAdd, pinned, onPinnedChange, orphans, onAdopt, docked }: StripProps & { docked: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeSectionId]);

  return (
    <nav className={`slide-strip${docked ? ' is-docked' : ''}`} aria-label="Slides">
      <ol ref={listRef}>
        {slides.map((s, i) => {
          const active = s.sectionId === activeSectionId;
          return (
            <li key={s.sectionId}>
              <button type="button" className={`slide-thumb${active ? ' is-on' : ''}`} aria-current={active}
                onClick={() => onSelect(s.sectionId)} title={`${i + 1}. ${s.title}`}>
                <span className="slide-thumb-box">
                  <SlideImage scene={scene} frameId={s.frameId} label={s.title} className="is-thumb" />
                </span>
                <span className="slide-thumb-label"><b>{i + 1}</b> {s.title}</span>
              </button>
            </li>
          );
        })}
        {orphans.length > 0 && (
          <li className="orphan-head" aria-label="Unlinked slides">
            <span>Unlinked<br />slides</span>
          </li>
        )}
        {orphans.map(o => (
          <li key={o.frameId}>
            <button type="button" className="slide-thumb is-orphan" onClick={() => onAdopt(o.frameId)}
              title={`"${o.title}" has drawings but no section uses it. Click to use it for the current section.`}>
              <span className="slide-thumb-box">
                <SlideImage scene={scene} frameId={o.frameId} label={o.title} className="is-thumb" />
              </span>
              <span className="slide-thumb-label">Use here: {o.title}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="slide-add" onClick={onAdd} title="Add a section with its own slide after the current one">
            <Plus size={16} aria-hidden="true" />
            <span>Add slide</span>
          </button>
        </li>
      </ol>
      <button type="button" className="icon-btn icon-btn-plain strip-pin" onClick={() => onPinnedChange(!pinned)}
        aria-pressed={pinned} title={pinned ? 'Unpin: hide the slides behind a button' : 'Pin: keep the slides visible'}>
        {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
        <span className="visually-hidden">{pinned ? 'Unpin slides' : 'Pin slides'}</span>
      </button>
    </nav>
  );
}
