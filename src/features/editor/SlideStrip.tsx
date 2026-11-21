import { Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CanvasScene } from '../../domain/types.ts';
import SlideImage from '../canvas/SlideImage.tsx';

export interface SlideRef { sectionId: string; title: string; frameId: string }

/**
 * PowerPoint-style slide sorter under the canvas: one thumbnail per section (in text order).
 * Clicking a slide jumps to its section; "Add slide" adds a new section + slide after the current one.
 */
export default function SlideStrip({ slides, activeSectionId, scene, onSelect, onAdd }: {
  slides: SlideRef[];
  activeSectionId: string | null;
  /** Snapshot of the canvas (a new object after edits re-renders the thumbnails). */
  scene: CanvasScene;
  onSelect: (sectionId: string) => void;
  onAdd: () => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeSectionId]);

  return (
    <nav className="slide-strip" aria-label="Slides">
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
        <li>
          <button type="button" className="slide-add" onClick={onAdd} title="Add a section with its own slide after the current one">
            <Plus size={18} aria-hidden="true" />
            <span>Add slide</span>
          </button>
        </li>
      </ol>
    </nav>
  );
}
