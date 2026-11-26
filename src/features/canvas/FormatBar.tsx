import { AlignCenter, AlignLeft, AlignRight, BringToFront, ChevronDown, Eye, Layers, SendToBack, SlidersHorizontal, Trash2, Type, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { applyStyle, deleteSelection, moveSelection, type ExcalidrawImperativeAPI } from './excalidraw.ts';
import ShapesPanel from './ShapesPanel.tsx';
import { ARROWHEADS, FILL_COLORS, FONT_SIZES, FONTS, STROKE_COLORS, summarize, type StyleKey, type StyleValue, type Summary } from './format.ts';

/**
 * Study Split's drawing format bar (replaces Excalidraw's floating properties panel, which covered the slide).
 * With a selection it restyles the selection; with nothing selected it sets the style of the next shapes.
 */
export default function FormatBar({ api, slideId, nativeOpen, onToggleNative, trailing, unfold }: {
  /** Unfold on: which step the cursor's paragraph is, and how to (re)assign the selected parts. */
  unfold?: { step: number | null; assign: (where: 'current' | 'start') => void };
  /** Shown at the right end of the bar (e.g. the full-screen button). */
  trailing?: React.ReactNode;
  api: ExcalidrawImperativeAPI | null;
  /** Current slide: shapes from the pack are inserted in its middle. */
  slideId: string | null;
  nativeOpen: boolean;
  onToggleNative: () => void;
}) {
  const [s, setS] = useState<Summary | null>(null);
  // Narrow drawing side → icon-only buttons (labels hidden).
  const [compact, setCompact] = useState(false);
  const barRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setCompact(el.clientWidth < 700));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    <>
    <div ref={barRef} className={`format-bar${compact ? ' is-compact' : ''}`} role="toolbar" aria-label="Drawing style">
      <ShapesPanel api={api} slideId={slideId} />
      {s.kinds.any && <span className="fb-sep" aria-hidden="true" />}

      {s.kinds.stroke && (
        <ColorPicker label={`${s.kinds.line ? 'Stroke colour' : 'Text colour'} (${scope})`} caption={s.kinds.line ? 'Stroke' : 'Colour'} value={v.strokeColor} colors={STROKE_COLORS} onPick={set('strokeColor')} kind="stroke" />
      )}
      {s.kinds.fill && (
        <ColorPicker label={`Fill (${scope})`} caption="Fill" value={v.backgroundColor} colors={FILL_COLORS} onPick={set('backgroundColor')} kind="fill"
          extra={(
            <Row label="Fill">
              <Seg label="Fill style" value={v.fillStyle} onPick={set('fillStyle')}
                options={[['solid', 'Solid'], ['hachure', 'Hatched'], ['cross-hatch', 'Cross']]} />
            </Row>
          )} />
      )}

      {s.kinds.line && (
        <Pop label={`Line (${scope})`} caption="Line" trigger={<>{lineIcon}</>}>
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

      {s.kinds.font && (
        <FontPicker
          value={s.kinds.text ? v.fontFamily : s.defaults.fontFamily}
          appliesTo={s.kinds.text ? scope : s.count ? 'labels' : 'next text'}
          onPick={set('fontFamily')} />
      )}

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

      {s.count > 0 && unfold && (
        <Pop label="Unfold: when these parts appear" caption="Step" trigger={<Layers size={15} aria-hidden="true" />}>
          {close => (
            <div className="fb-menu">
              <button type="button" className="menu-item" disabled={unfold.step === null}
                onMouseDown={e => e.preventDefault()} onClick={() => { unfold.assign('current'); close(); }}>
                <Layers size={16} aria-hidden="true" />
                <span className="menu-item-text">
                  {unfold.step === null ? 'Show with a paragraph' : `Show with paragraph ${unfold.step}`}
                  <small>{unfold.step === null ? 'Click into a paragraph on the left first' : 'The paragraph your cursor is in'}</small>
                </span>
              </button>
              <button type="button" className="menu-item" onMouseDown={e => e.preventDefault()} onClick={() => { unfold.assign('start'); close(); }}>
                <Eye size={16} aria-hidden="true" />
                <span className="menu-item-text">Always visible<small>Shown from the first paragraph</small></span>
              </button>
            </div>
          )}
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
      {(s.kinds.any || s.count > 0) && (
      <button type="button" className={`tb-style fb-style-toggle${nativeOpen ? ' is-open' : ''}`} aria-pressed={nativeOpen}
        title={nativeOpen ? 'Hide the Style panel' : 'Style panel: all options (opacity, arrowheads, layers…)'}
        onMouseDown={e => e.preventDefault()} onClick={onToggleNative}>
        <SlidersHorizontal size={16} aria-hidden="true" /><span className="tb-style-label">Style</span>
      </button>
      )}
      {trailing}
    </div>
    {/* The panel stays "open" but only shows while there is something to style (select something and it comes back). */}
    {nativeOpen && (s.kinds.any || s.count > 0) && <StylePanel api={api} s={s} scope={scope} onClose={onToggleNative} />}
    </>
  );
}

/**
 * Style panel (2026-11-26): every option in one themed panel, replacing Excalidraw's own properties panel.
 * Restyles the selection, or sets the style of the next shapes when nothing is selected.
 */
function StylePanel({ api, s, scope, onClose }: { api: ExcalidrawImperativeAPI; s: Summary; scope: string; onClose: () => void }) {
  const set = (key: StyleKey) => (value: StyleValue) => applyStyle(api, key, value);
  const v = s.values;
  const committed = typeof v.opacity === 'number' ? v.opacity : 100;
  return (
    <section className="style-panel" aria-label="Style">
      <header className="style-panel-head">
        <span><b>Style</b><small>{s.count ? scope : 'for the next shapes'}</small></span>
        <button type="button" className="tb-btn" aria-label="Close the Style panel" title="Close" onMouseDown={e => e.preventDefault()} onClick={onClose}><X size={16} /></button>
      </header>
      <div className="style-panel-body">
        {s.kinds.stroke && <PanelRow label={s.kinds.line ? 'Stroke' : 'Colour'}><Swatches value={v.strokeColor} colors={STROKE_COLORS} kind="stroke" onPick={set('strokeColor')} /></PanelRow>}
        {s.kinds.fill && (
          <>
            <PanelRow label="Fill"><Swatches value={v.backgroundColor} colors={FILL_COLORS} kind="fill" onPick={set('backgroundColor')} /></PanelRow>
            <PanelRow label="Pattern">
              <Seg label="Fill pattern" value={v.fillStyle} onPick={set('fillStyle')} options={[['solid', 'Solid'], ['hachure', 'Hatched'], ['cross-hatch', 'Cross']]} />
            </PanelRow>
          </>
        )}
        {s.kinds.line && (
          <>
            <PanelRow label="Width">
              <Seg label="Stroke width" value={v.strokeWidth} onPick={set('strokeWidth')} icons
                options={[[1, <LineIcon key="1" w={1} />, 'Thin'], [2, <LineIcon key="2" w={2.4} />, 'Medium'], [4, <LineIcon key="4" w={4} />, 'Bold']]} />
            </PanelRow>
            <PanelRow label="Line">
              <Seg label="Line style" value={v.strokeStyle} onPick={set('strokeStyle')} icons
                options={[['solid', <LineIcon key="s" w={2} />, 'Solid'], ['dashed', <LineIcon key="d" w={2} dash="5 3" />, 'Dashed'], ['dotted', <LineIcon key="o" w={2} dash="1.5 3" />, 'Dotted']]} />
            </PanelRow>
            <PanelRow label="Look">
              <Seg label="Look" value={v.roughness} onPick={set('roughness')} icons
                options={[[0, <WaveIcon key="0" amp={0} />, 'Neat'], [1, <WaveIcon key="1" amp={1.6} />, 'Hand-drawn'], [2, <WaveIcon key="2" amp={3.2} />, 'Sketchy']]} />
            </PanelRow>
          </>
        )}
        {s.kinds.edges && (
          <PanelRow label="Edges">
            <Seg label="Edges" value={v.roundness} onPick={set('roundness')} icons
              options={[['sharp', <EdgeIcon key="s" r={0} />, 'Sharp'], ['round', <EdgeIcon key="r" r={4} />, 'Round']]} />
          </PanelRow>
        )}
        {s.kinds.arrow && (
          <>
            <PanelRow label="Start">
              <Seg label="Arrow start" value={v.startArrowhead} onPick={set('startArrowhead')} icons
                options={ARROWHEADS.map(a => [a.value, <HeadIcon key={a.value} kind={a.value} flip />, a.name] as Option)} />
            </PanelRow>
            <PanelRow label="End">
              <Seg label="Arrow end" value={v.endArrowhead} onPick={set('endArrowhead')} icons
                options={ARROWHEADS.map(a => [a.value, <HeadIcon key={a.value} kind={a.value} />, a.name] as Option)} />
            </PanelRow>
          </>
        )}
        {s.kinds.font && (
          <PanelRow label="Font">
            <Seg label="Font" value={s.kinds.text ? v.fontFamily : s.defaults.fontFamily} onPick={set('fontFamily')} options={FONTS.map(f => [f.value, f.name])} />
          </PanelRow>
        )}
        {s.kinds.text && (
          <>
            <PanelRow label="Size">
              <Seg label="Font size" value={v.fontSize} onPick={set('fontSize')} options={FONT_SIZES.map(f => [f.value, f.name])} />
            </PanelRow>
            <PanelRow label="Align">
              <Seg label="Text align" value={v.textAlign} onPick={set('textAlign')} icons
                options={[['left', <AlignLeft key="l" size={15} />, 'Left'], ['center', <AlignCenter key="c" size={15} />, 'Centre'], ['right', <AlignRight key="r" size={15} />, 'Right']]} />
            </PanelRow>
          </>
        )}
        <PanelRow label="Opacity">
          <Opacity initial={committed} mixed={typeof v.opacity !== 'number' && s.count > 0}
            onCommit={value => applyStyle(api, 'opacity', value)} />
        </PanelRow>
        {s.count > 0 && (
          <PanelRow label="Layer">
            <span className="style-actions">
              <button type="button" className="btn btn-ghost btn-sm" onMouseDown={e => e.preventDefault()} onClick={() => moveSelection(api, 'front')}><BringToFront size={14} aria-hidden="true" /> Front</button>
              <button type="button" className="btn btn-ghost btn-sm" onMouseDown={e => e.preventDefault()} onClick={() => moveSelection(api, 'back')}><SendToBack size={14} aria-hidden="true" /> Back</button>
              <button type="button" className="tb-btn is-danger" aria-label="Delete (Del)" title="Delete (Del)" onMouseDown={e => e.preventDefault()} onClick={() => deleteSelection(api)}><Trash2 size={15} /></button>
            </span>
          </PanelRow>
        )}
      </div>
    </section>
  );
}

/** Opacity slider: moves freely and saves once you pause (or release the mouse): one undo step, not dozens. */
function Opacity({ initial, mixed, onCommit }: { initial: number; mixed: boolean; onCommit: (value: number) => void }) {
  const [value, setValue] = useState(initial);
  // Follow the saved value when it changes from elsewhere (another selection, undo) without remounting the slider.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) { setSeen(initial); setValue(initial); }
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const commitSoon = (next: number, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (next !== initial) onCommit(next); }, delay);
  };
  return (
    <span className="style-opacity">
      <input type="range" min={0} max={100} step={5} value={value} aria-label="Opacity"
        onChange={e => { const next = Number(e.target.value); setValue(next); commitSoon(next, 500); }}
        onPointerUp={() => commitSoon(value, 0)} />
      <output>{mixed && value === initial ? 'mixed' : `${value}%`}</output>
    </span>
  );
}

function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="style-row"><span className="style-row-label">{label}</span><div className="style-row-control">{children}</div></div>;
}

function Swatches({ value, colors, kind, onPick }: {
  value: StyleValue | undefined; colors: readonly { value: string; name: string }[]; kind: 'stroke' | 'fill'; onPick: (v: string) => void;
}) {
  const current = typeof value === 'string' ? value : undefined;
  return (
    <div className="style-swatches" role="radiogroup" aria-label={kind === 'fill' ? 'Fill colour' : 'Stroke colour'}>
      {colors.map(c => (
        <button key={c.value} type="button" role="radio" aria-checked={current === c.value} className={`fb-swatch${current === c.value ? ' is-on' : ''}`}
          title={c.name} aria-label={c.name} onMouseDown={e => e.preventDefault()} onClick={() => onPick(c.value)}>
          <Swatch color={c.value} kind={kind} />
        </button>
      ))}
      <label className="fb-swatch fb-custom" title="Custom colour">
        <input type="color" value={current && current.startsWith('#') && current.length === 7 ? current : '#1e1e1e'}
          onChange={e => onPick(e.target.value)} aria-label="Custom colour" />
      </label>
    </div>
  );
}

const HeadIcon = ({ kind, flip = false }: { kind: string; flip?: boolean }) => (
  <svg width="24" height="14" viewBox="0 0 24 14" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <line x1="3" y1="7" x2={kind === 'none' ? 21 : 17} y2="7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    {kind === 'arrow' && <path d="M15 3 L21 7 L15 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    {kind === 'triangle' && <path d="M15 3 L21 7 L15 11 Z" fill="currentColor" />}
    {kind === 'dot' && <circle cx="18.5" cy="7" r="3" fill="currentColor" />}
    {kind === 'bar' && <line x1="20" y1="2.5" x2="20" y2="11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
  </svg>
);

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
function Pop({ label, trigger, children, caption }: { label: string; trigger: ReactNode; children: ReactNode | ((close: () => void) => ReactNode); caption?: string }) {
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
      <button type="button" className={`${caption ? 'tb-style' : 'tb-btn'} fb-trigger${open ? ' is-on' : ''}`} aria-label={label} title={label}
        aria-expanded={open} aria-haspopup="dialog" onMouseDown={e => e.preventDefault()} onClick={toggle}>
        {trigger}{caption && <span className="tb-style-label">{caption}</span>}<ChevronDown size={12} aria-hidden="true" className="fb-chev" />
      </button>
      {open && <div className="fb-popover" style={pos} role="dialog" aria-label={label}>{typeof children === 'function' ? children(() => setOpen(false)) : children}</div>}
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

function ColorPicker({ label, value, colors, onPick, kind, extra, caption }: {
  label: string; value: StyleValue | undefined; colors: readonly { value: string; name: string }[];
  onPick: (v: string) => void; kind: 'stroke' | 'fill'; extra?: ReactNode; caption?: string;
}) {
  const current = typeof value === 'string' ? value : undefined;
  return (
    <Pop label={label} caption={caption} trigger={<Swatch color={current} kind={kind} />}>
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
