import { Shapes } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { readJson, writeJson } from '../../lib/storage.ts';
import { nextSvgPrefix, scopeSvgIds } from '../../lib/svgIds.ts';
import { useResolvedTheme } from '../../lib/useResolvedTheme.ts';
import { insertShape, shapePreview, type ExcalidrawImperativeAPI } from './excalidraw.ts';
import { SHAPES, type ShapeCategory, type ShapeDef } from './shapes.ts';

const TABS: { key: ShapeCategory; label: string }[] = [
  { key: 'system', label: 'System design' },
  { key: 'data', label: 'Data structures' }
];
const TAB_KEY = 'ss.editor.shapesTab';

/** "Shapes" button + panel: the built-in Study Split shape pack, inserted on the current slide. */
export default function ShapesPanel({ api, slideId }: { api: ExcalidrawImperativeAPI; slideId: string | null }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ShapeCategory>(() => readJson<ShapeCategory>(TAB_KEY, 'system'));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pickTab = (t: ShapeCategory) => { setTab(t); writeJson(TAB_KEY, t); };
  const insert = (def: ShapeDef) => { insertShape(api, def.build(), slideId); setOpen(false); };

  return (
    <div className="fb-color shapes" ref={ref}>
      <button type="button" className={`btn btn-sm shapes-btn${open ? ' is-on' : ''}`} aria-expanded={open} aria-haspopup="dialog"
        onMouseDown={e => e.preventDefault()} onClick={() => setOpen(o => !o)} title="Insert a ready-made shape">
        <Shapes size={15} aria-hidden="true" /> Shapes
      </button>
      {open && (
        <div className="fb-popover shapes-popover" role="dialog" aria-label="Shapes">
          <div className="segmented segmented-sm shapes-tabs" role="tablist" aria-label="Shape category">
            {TABS.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-pressed={tab === t.key}
                onClick={() => pickTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="shapes-grid" role="tabpanel">
            {SHAPES.filter(s => s.category === tab).map(def => (
              <button key={def.key} type="button" className="shape-tile" onClick={() => insert(def)} title={`Insert ${def.name}`}>
                <ShapeThumb def={def} />
                <span>{def.name}</span>
              </button>
            ))}
          </div>
          <p className="shapes-hint">Inserted in the middle of the slide as a group: drag to place, double-click to edit a part.</p>
        </div>
      )}
    </div>
  );
}

function ShapeThumb({ def }: { def: ShapeDef }) {
  const theme = useResolvedTheme();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false;
    shapePreview(def.key, def.build(), theme === 'dark').then(markup => {
      if (!cancelled && ref.current) ref.current.innerHTML = scopeSvgIds(markup, nextSvgPrefix());   // our own export, ids scoped
    }, () => {});
    return () => { cancelled = true; };
  }, [def, theme]);
  return <span ref={ref} className="shape-thumb" aria-hidden="true" />;
}
