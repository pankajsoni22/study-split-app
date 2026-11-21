import { LAYOUTS, type LayoutId } from '../domain/layouts.ts';

/** Five layout buttons; each icon shows the text (lines) : drawing (box) proportion. */
export default function LayoutPicker({ value, onChange, label = 'Layout' }: { value: LayoutId; onChange: (id: LayoutId) => void; label?: string }) {
  return (
    <div className="segmented segmented-sm layout-picker" role="radiogroup" aria-label={label}>
      {LAYOUTS.map(l => (
        <button key={l.id} type="button" role="radio" aria-checked={value === l.id} title={`${l.label} (text : drawing)`}
          onClick={() => { if (l.id !== value) onChange(l.id); }}>
          <LayoutIcon text={l.text} />
          <span className="visually-hidden">{l.label}</span>
        </button>
      ))}
    </div>
  );
}

function LayoutIcon({ text }: { text: number }) {
  const w = 26;
  const split = Math.round(w * text);
  return (
    <svg width={w} height={16} viewBox={`0 0 ${w} 16`} aria-hidden="true" className="layout-icon">
      <rect x="0.5" y="0.5" width={w - 1} height="15" rx="3" fill="none" stroke="currentColor" opacity=".45" />
      {[4, 7.5, 11].map(y => <line key={y} x1="3" x2={Math.max(4, split - 3)} y1={y} y2={y} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />)}
      <line x1={split} x2={split} y1="1" y2="15" stroke="currentColor" opacity=".45" />
      <rect x={split + 2.5} y="3.5" width={w - split - 5.5} height="9" rx="1.5" fill="currentColor" opacity=".55" />
    </svg>
  );
}
