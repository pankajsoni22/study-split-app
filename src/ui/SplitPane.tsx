import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { nearestLayout, stepLayout, type LayoutId } from '../domain/layouts.ts';
import { layoutById } from '../domain/layouts.ts';

/**
 * Two panes split by a "spine" that snaps to the fixed layouts (70:30 … 30:70).
 * While dragging, the split jumps between layouts; the choice is committed on release.
 * Keyboard: ←/→ move one layout, Home = the default. Double-click = the default.
 */
export default function SplitPane({ left, right, layout, defaultLayout, onLayoutChange, leftLabel, rightLabel }: {
  left: ReactNode;
  right: ReactNode;
  layout: LayoutId;
  defaultLayout: LayoutId;
  onLayoutChange: (layout: LayoutId) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<LayoutId | null>(null);
  const shown = layoutById(preview ?? layout);

  const fromPointer = (clientX: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (box && box.width > 0) setPreview(nearestLayout((clientX - box.left) / box.width).id);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
    setPreview(layout);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => { if (preview) fromPointer(e.clientX); };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove('is-resizing');
    if (preview && preview !== layout) onLayoutChange(preview);
    setPreview(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === 'ArrowRight' ? stepLayout(layout, 1).id : e.key === 'ArrowLeft' ? stepLayout(layout, -1).id : e.key === 'Home' ? defaultLayout : null;
    if (next) { e.preventDefault(); if (next !== layout) onLayoutChange(next); }
  };

  return (
    <div ref={rootRef} className={`split${preview ? ' is-dragging' : ''}`} style={{ gridTemplateColumns: `${shown.text}fr 10px ${1 - shown.text}fr` }}>
      <section className="split-pane split-left" aria-label={leftLabel}>{left}</section>
      <div className="split-spine" role="separator" aria-orientation="vertical" aria-label="Layout (text : drawing)"
        aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(shown.text * 100)} aria-valuetext={shown.id.replace('-', ' : ')}
        tabIndex={0} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onDoubleClick={() => { if (layout !== defaultLayout) onLayoutChange(defaultLayout); }} onKeyDown={onKeyDown}
        title="Drag to change the layout · double-click for the article's default">
        <span className="split-grip" aria-hidden="true" />
        {preview && <span className="split-badge" aria-hidden="true">{shown.id.replace('-', ' : ')}</span>}
      </div>
      <section className="split-pane split-right" aria-label={rightLabel}>{right}</section>
    </div>
  );
}
