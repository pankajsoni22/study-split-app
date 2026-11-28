import { ChevronDown, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import MenuButton from './MenuButton.tsx';

/**
 * A top-bar menu that always shows what is set: "Layout  Auto ▾", "Mode  Split · Unfold ▾" (decided 2026-11-28:
 * Layout, Mode and Settings are the same three menus in the editor and the reader; ⋯ holds only Settings).
 * `disabled` shows the current value but cannot be opened (e.g. Layout while reading in Article view).
 */
export default function BarMenu({ label, value, Icon, children, disabled, disabledHint, align = 'right', className = '' }: {
  label: string; value: string; Icon: LucideIcon; children: (close: () => void) => ReactNode;
  disabled?: boolean; disabledHint?: string; align?: 'left' | 'right'; className?: string;
}) {
  const face = (
    <>
      <Icon size={15} aria-hidden="true" className="bar-menu-icon" />
      <span className="bar-menu-label">{label}</span>
      <span className="bar-menu-value">{value}</span>
      <ChevronDown size={14} aria-hidden="true" className="bar-menu-chevron" />
    </>
  );
  if (disabled) {
    return <button type="button" className={`bar-menu is-disabled ${className}`} disabled title={disabledHint} aria-label={`${label}: ${value}. ${disabledHint ?? ''}`}>{face}</button>;
  }
  return (
    <MenuButton label={`${label}: ${value}. Change ${label.toLowerCase()}`} align={align} buttonClassName={`bar-menu ${className}`} trigger={face}>
      {children}
    </MenuButton>
  );
}

/** One choice of several in a bar menu (a radio item with a title and a one-line explanation). */
export function MenuChoice({ checked, title, hint, onPick, disabled }: {
  checked: boolean; title: string; hint?: string; onPick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" role="menuitemradio" aria-checked={checked} className={`menu-item menu-choice${checked ? ' is-checked' : ''}`}
      disabled={disabled} onClick={() => { if (!checked) onPick(); }}>
      <span className="menu-radio" aria-hidden="true" />
      <span className="menu-item-text">{title}{hint && <small>{hint}</small>}</span>
    </button>
  );
}
