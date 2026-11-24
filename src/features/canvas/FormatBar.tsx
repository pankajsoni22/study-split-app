import { AlignCenter, AlignLeft, AlignRight, BringToFront, ChevronDown, SendToBack, SlidersHorizontal, Trash2, Type } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { applyStyle, deleteSelection, moveSelection, type ExcalidrawImperativeAPI } from './excalidraw.ts';
import ShapesPanel from './ShapesPanel.tsx';
import { FILL_COLORS, FONT_SIZES, FONTS, STROKE_COLORS, summarize, type StyleKey, type StyleValue, type Summary } from './format.ts';

/**
 * Study Split's drawing format bar (replaces Excalidraw's floating properties panel, which covered the slide).
 * With a selection it restyles the selection; with nothing selected it sets the style of the next shapes.
 */
export default function FormatBar({ api, slideId, nativeOpen, onToggleNative, trailing }: {
  /** Shown at the right end of the bar (e.g. the full-screen button). */
  trailing?: React.ReactNode;
  api: ExcalidrawImperativeAPI | null;
  /** Current slide: shapes from the pack are inserted in its middle. */
  slideId: string | null;
  nativeOpen: boolean;
  onToggleNative: () => void;
}) {
  const [s, setS] = useState<Summary | null>(null);

  useEffect(() => {
    if (!api) return;
    let raf = 0;
    let last = '';
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const st = api.getAppState();
        const next = summarize(api.getSceneElements(), st.selectedElementIds, st);
        const key = JSON.stringify(next);
        if (key !== last) { last = key; setS(next); }
      });
    };
    update();
    const unsubscribe = api.onChange(update);
    return () => { unsubscribe(); cancelAnimationFrame(raf); };
  }, [api]);

  if (!api || !s) return <div className="format-bar is-empty">{trailing && <div className="tb-trailing">{trailing}</div>}</div>;
  const set = (key: StyleKey) => (value: StyleValue) => applyStyle(api, key, value);
  const v = s.values;

  const lineIcon = <LineIcon w={v.strokeWidth === 1 ? 1 : v.strokeWidth === 4 ? 4 : 2.4} dash={v.strokeStyle === 'dashed' ? '5 3' : v.strokeStyle === 'dotted' ? '1.5 3' : undefined} />;
  const scope = s.count ? `${s.count} selected` : 'next shapes';

  return (
    <div className="format-bar" role="toolbar" aria-label="Drawing style">
      <ShapesPanel api={api} slideId={slideId} />
      <span className="fb-sep" aria-hidden="true" />

      {s.kinds.stroke && (
        <ColorPicker label={`Stroke colour (${scope})`} value={v.strokeColor} colors={STROKE_COLORS} onPick={set('strokeColor')} kind="stroke" />
      )}
      {s.kinds.fill && (
        <ColorPicker label={`Fill (${scope})`} value={v.backgroundColor} colors={FILL_COLORS} onPick={set('backgroundColor')} kind="fill"
          extra={(
            <Row label="Fill">
              <Seg label="Fill style" value={v.fillStyle} onPick={set('fillStyle')}
                options={[['solid', 'Solid'], ['hachure', 'Hatched'], ['cross-hatch', 'Cross']]} />
            </Row>
          )} />
      )}

      {s.kinds.stroke && (
        <Pop label={`Line (${scope})`} trigger={<>{lineIcon}</>}>
          <Row label="Width">
            <Seg label="Stroke width" value={v.strokeWidth} onPick={set('strokeWidth')} icons
              options={[[1, <LineIcon key="1" w={1} />, 'Thin'], [2, <LineIcon key="2" w={2.4} />, 'Medium'], [4, <LineIcon key="4" w={4} />, 'Bold']]} />
          </Row>
          <Row label="Style">
            <Seg label="Stroke style" value={v.strokeStyle} onPick={set('strokeStyle')} icons
              options={[['solid', <LineIcon key="s" w={2} />, 'Solid'], ['dashed', <LineIcon key="d" w={2} dash="5 3" />, 'Dashed'], ['dotted', <LineIcon key="o" w={2} dash="1.5 3" />, 'Dotted']]} />
          </Row>
          <Row label="Look">
            <Seg label="Look" value={v.roughness} onPick={set('roughness')} icons
              options={[[0, <WaveIcon key="0" amp={0} />, 'Neat'], [1, <WaveIcon key="1" amp={1.6} />, 'Hand-drawn'], [2, <WaveIcon key="2" amp={3.2} />, 'Sketchy']]} />
          </Row>
          {s.kinds.edges && (
            <Row label="Edges">
              <Seg label="Edges" value={v.roundness} onPick={set('roundness')} icons
                options={[['sharp', <EdgeIcon key="s" r={0} />, 'Sharp edges'], ['round', <EdgeIcon key="r" r={4} />, 'Round edges']]} />
            </Row>
          )}
        </Pop>
      )}

      <FontPicker
        value={s.kinds.text ? v.fontFamily : s.defaults.fontFamily}
        appliesTo={s.kinds.text ? scope : 'next text'}
        onPick={set('fontFamily')} />

      {s.kinds.text && (
        <Pop label={`Text size and alignment (${scope})`} trigger={<span className="fb-aa">Aa</span>}>
          <Row label="Size">
            <Seg label="Font size" value={v.fontSize} onPick={set('fontSize')} options={FONT_SIZES.map(f => [f.value, f.name])} />
          </Row>
          <Row label="Align">
            <Seg label="Text align" value={v.textAlign} onPick={set('textAlign')} icons
              options={[['left', <AlignLeft key="l" size={15} />, 'Left'], ['center', <AlignCenter key="c" size={15} />, 'Centre'], ['right', <AlignRight key="r" size={15} />, 'Right']]} />
          </Row>
        </Pop>
      )}

      {s.count > 0 && (
        <>
          <span className="fb-sep" aria-hidden="true" />
          <IconBtn label="Bring to front" onClick={() => moveSelection(api, 'front')}><BringToFront size={16} /></IconBtn>
          <IconBtn label="Send to back" onClick={() => moveSelection(api, 'back')}><SendToBack size={16} /></IconBtn>
          <IconBtn label="Delete (Del)" onClick={() => deleteSelection(api)} danger><Trash2 size={16} /></IconBtn>
        </>
      )}
      <span className="fb-spacer" />
      <IconBtn label={nativeOpen ? 'Hide all options' : 'More options (opacity, arrowheads, links…)'} onClick={onToggleNative} pressed={nativeOpen}>
        <SlidersHorizontal size={16} />
      </IconBtn>
      {trailing}
    </div>
  );
}

// ---------------------------------------------------------------- small controls

function IconBtn({ label, onClick, children, danger = false, pressed }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean; pressed?: boolean }) {
  return (
    <button type="button" className={`tb-btn${danger ? ' is-danger' : ''}${pressed ? ' is-on' : ''}`} aria-label={label} title={label}
      aria-pressed={pressed} onMouseDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
  );
}

type Option = [StyleValue, ReactNode, string?];
function Seg({ label, value, options, onPick, icons = false }: { label: string; value: StyleValue | undefined; options: Option[]; onPick: (v: StyleValue) => void; icons?: boolean }) {
  return (
    <div className={`segmented segmented-sm fb-seg${icons ? ' is-icons' : ''}`} role="radiogroup" aria-label={label} title={label}>
      {options.map(([val, content, name]) => (
        <button key={String(val)} type="button" role="radio" aria-checked={value === val} aria-label={name ?? (typeof content === 'string' ? content : String(val))} title={name}
          onMouseDown={e => e.preventDefault()} onClick={() => onPick(val)}>{content}</button>
      ))}
    </div>
  );
}

/** Small button that opens a panel below it (flips left near the screen edge). Esc / click outside close it. */
function Pop({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const toggle = () => {
    // The bar scrolls sideways on narrow panes, so the panel floats above the page at the button's position.
    const box = ref.current?.getBoundingClientRect();
    if (box) setPos({ top: box.bottom + 6, left: Math.max(8, Math.min(box.left, window.innerWidth - 300)) });
    setOpen(o => !o);
  };
  return (
    <div className="fb-pop" ref={ref}>
      <button type="button" className={`tb-btn fb-trigger${open ? ' is-on' : ''}`} aria-label={label} title={label}
        aria-expanded={open} aria-haspopup="dialog" onMouseDown={e => e.preventDefault()} onClick={toggle}>
        {trigger}<ChevronDown size={12} aria-hidden="true" className="fb-chev" />
      </button>
      {open && <div className="fb-popover" style={pos} role="dialog" aria-label={label}>{children}</div>}
    </div>
  );
}

/**
 * Always-visible font picker. With text (or labelled shapes) selected it changes their font; otherwise it sets
 * the font for the next text, so the font can be chosen before typing.
 */
function FontPicker({ value, appliesTo, onPick }: { value: StyleValue | undefined; appliesTo: string; onPick: (v: number) => void }) {
  return (
    <label className="fb-font" title={`Font (${appliesTo})`}>
      <Type size={14} aria-hidden="true" />
      <select aria-label={`Font (${appliesTo})`} value={typeof value === 'number' ? value : ''}
        onChange={e => onPick(Number(e.target.value))}>
        {typeof value !== 'number' && <option value="">Mixed</option>}
        {FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
      </select>
    </label>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fb-row"><span className="fb-row-label">{label}</span>{children}</div>;
}

function ColorPicker({ label, value, colors, onPick, kind, extra }: {
  label: string; value: StyleValue | undefined; colors: readonly { value: string; name: string }[];
  onPick: (v: string) => void; kind: 'stroke' | 'fill'; extra?: ReactNode;
}) {
  const current = typeof value === 'string' ? value : undefined;
  return (
    <Pop label={label} trigger={<Swatch color={current} kind={kind} />}>
      <div className="fb-swatches">
        {colors.map(c => (
          <button key={c.value} type="button" className={`fb-swatch${current === c.value ? ' is-on' : ''}`} title={c.name} aria-label={c.name}
            onMouseDown={e => e.preventDefault()} onClick={() => onPick(c.value)}>
            <Swatch color={c.value} kind={kind} />
          </button>
        ))}
        <label className="fb-swatch fb-custom" title="Custom colour">
          <input type="color" value={current && current.startsWith('#') && current.length === 7 ? current : '#1e1e1e'}
            onChange={e => onPick(e.target.value)} aria-label="Custom colour" />
        </label>
      </div>
      {extra && <div className="fb-popover-extra">{extra}</div>}
    </Pop>
  );
}

function Swatch({ color, kind }: { color: string | undefined; kind: 'stroke' | 'fill' }) {
  if (color === undefined) return <span className="fb-dot is-mixed" aria-hidden="true">?</span>;
  if (color === 'transparent') return <span className="fb-dot is-none" aria-hidden="true" />;
  return <span className={`fb-dot${kind === 'fill' ? ' is-fill' : ''}`} style={{ background: color }} aria-hidden="true" />;
}

const LineIcon = ({ w, dash }: { w: number; dash?: string }) => (
  <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><line x1="2" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth={w} strokeDasharray={dash} strokeLinecap="round" /></svg>
);
const WaveIcon = ({ amp }: { amp: number }) => (
  <svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true">
    <path d={`M2 7 C6 ${7 - amp} 8 ${7 + amp} 11 7 S16 ${7 - amp} 20 7`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const EdgeIcon = ({ r }: { r: number }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx={r} fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
);
