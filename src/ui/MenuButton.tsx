import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A button that opens a small menu below it. Closes on outside click, Esc, or when an item asks to
 * (items get `close` so a click can close the menu; toggles can keep it open).
 */
export default function MenuButton({ label, trigger, children, className = '', buttonClassName = 'icon-btn', align = 'right' }: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  /** Class of the trigger button (default: a round icon button). */
  buttonClassName?: string;
  /** Which edge of the trigger the menu lines up with. */
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  return (
    <div className={`menu-wrap ${className}`} ref={root}>
      <button type="button" className={`${buttonClassName}${open ? ' is-open' : ''}`} aria-label={label} title={label}
        aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        onMouseDown={e => e.preventDefault()}   // keep the editor's selection while the menu is used
        onClick={() => setOpen(o => !o)}>
        {trigger}
      </button>
      {open && <div className={`menu-panel${align === 'left' ? ' is-left' : ''}`} role="menu" id={id} aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
