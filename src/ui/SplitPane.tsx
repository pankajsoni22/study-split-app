import { useCallback, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

const MIN = 0.25;
const MAX = 0.75;
const clamp = (r: number) => Math.min(MAX, Math.max(MIN, r));

/**
 * Two panes with a draggable "spine" (docs §4.2): 25–75%, double-click resets to 50%,
 * arrow keys move it 2% when focused. The ratio is controlled so callers can persist it.
 */
export default function SplitPane({ left, right, ratio, onRatioChange, leftLabel, rightLabel }: {
  left: ReactNode;
  right: ReactNode;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  leftLabel: string;
  rightLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = useCallback((clientX: number) => {
    const box = rootRef.current?.getBoundingClientRect();
    if (box && box.width > 0) onRatioChange(clamp((clientX - box.left) / box.width));
  }, [onRatioChange]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => { if (dragging.current) fromPointer(e.clientX); };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove('is-resizing');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onRatioChange(clamp(ratio - 0.02)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onRatioChange(clamp(ratio + 0.02)); }
    if (e.key === 'Home') { e.preventDefault(); onRatioChange(0.5); }
  };

  return (
    <div ref={rootRef} className="split" style={{ gridTemplateColumns: `${ratio}fr 10px ${1 - ratio}fr` }}>
      <section className="split-pane split-left" aria-label={leftLabel}>{left}</section>
      <div className="split-spine" role="separator" aria-orientation="vertical" aria-label="Resize panes"
        aria-valuemin={MIN * 100} aria-valuemax={MAX * 100} aria-valuenow={Math.round(ratio * 100)} tabIndex={0}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onDoubleClick={() => onRatioChange(0.5)} onKeyDown={onKeyDown} title="Drag to resize · double-click to reset">
        <span className="split-grip" aria-hidden="true" />
      </div>
      <section className="split-pane split-right" aria-label={rightLabel}>{right}</section>
    </div>
  );
}
