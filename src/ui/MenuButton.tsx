import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A button that opens a small menu below it. Closes on outside click, Esc, or when an item asks to
 * (items get `close` so a click can close the menu; toggles can keep it open).
 */
export default function MenuButton({ label, trigger, children, className = '', buttonClassName = 'icon-btn', align = 'right', fixed = false }: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  /** Class of the trigger button (default: a round icon button). */
  buttonClassName?: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: 'left' | 'right';
  /** Open the menu in a layer above the page (for triggers inside a sideways-scrolling bar, which would clip it). */
  fixed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); } };
    // A fixed menu would drift away from its trigger when the page or bar scrolls: close it instead.
    const onScroll = (e: Event) => { if (fixed && !root.current?.querySelector('.menu-panel')?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll);
    };
  }, [open, fixed]);

  const toggle = () => {
    if (!open && fixed) {
      const r = root.current?.querySelector('button')?.getBoundingClientRect();
      if (r) setPlace(align === 'left'
        ? { position: 'fixed', top: r.bottom + 6, left: Math.max(8, r.left), right: 'auto' }
        : { position: 'fixed', top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right), left: 'auto' });
    }
    setOpen(o => !o);
  };

  return (
    <div className={`menu-wrap ${className}`} ref={root}>
      <button type="button" className={`${buttonClassName}${open ? ' is-open' : ''}`} aria-label={label} title={label}
        aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onMouseDown={e => e.preventDefault()}   // keep the editor's selection while the menu is used
        onClick={toggle}>
        {trigger}
      </button>
      {open && (
        <div className={`menu-panel${align === 'left' ? ' is-left' : ''}`} role="menu" id={id} aria-label={label} style={fixed ? place : undefined}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
