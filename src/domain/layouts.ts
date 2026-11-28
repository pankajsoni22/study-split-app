// Fixed text:drawing layouts and the slide shape each one implies (docs §4.2, decided 2026-11-22).
// The author picks the article's layout; it is stored with the canvas (so it is versioned with
// every published version) and sets the slide shape. Readers may switch layout for themselves;
// slides are then scaled to fit with margins.

export type LayoutId = '70-30' | '60-40' | '50-50' | '40-60' | '30-70';

export interface Layout {
  id: LayoutId;
  /** Share of the width given to the text side. */
  text: number;
  /** Slide size in canvas units (shape fills that side well on a typical laptop screen). */
  slide: { width: number; height: number };
  label: string;
}

export const LAYOUTS: Layout[] = [
  { id: '70-30', text: 0.7, slide: { width: 900, height: 1500 }, label: 'Text focus · 70:30' },   // 3:5
  { id: '60-40', text: 0.6, slide: { width: 1200, height: 1600 }, label: '60:40' },              // 3:4
  { id: '50-50', text: 0.5, slide: { width: 1400, height: 1400 }, label: 'Balanced · 50:50' },   // 1:1
  { id: '40-60', text: 0.4, slide: { width: 1600, height: 1200 }, label: '40:60' },              // 4:3
  { id: '30-70', text: 0.3, slide: { width: 1600, height: 1000 }, label: 'Drawing focus · 30:70' } // 16:10
];

export const DEFAULT_LAYOUT: LayoutId = '50-50';

/** "60-40" → "60:40" (short form for menus). */
export const layoutRatio = (id: string) => id.replace('-', ':');

export function layoutById(id: string | null | undefined): Layout {
  return LAYOUTS.find(l => l.id === id) ?? LAYOUTS.find(l => l.id === DEFAULT_LAYOUT)!;
}

/** The layout whose split is closest to a dragged ratio (the divider snaps to it). */
export function nearestLayout(ratio: number): Layout {
  return LAYOUTS.reduce((best, l) => (Math.abs(l.text - ratio) < Math.abs(best.text - ratio) ? l : best));
}

/** Neighbouring layout for keyboard control: +1 = more text, -1 = more drawing. */
export function stepLayout(id: LayoutId, direction: 1 | -1): Layout {
  const sorted = [...LAYOUTS].sort((a, b) => a.text - b.text);
  const i = sorted.findIndex(l => l.id === id);
  return sorted[Math.min(sorted.length - 1, Math.max(0, i + direction))]!;
}

/** Horizontal distance between slides on the canvas: far enough that a neighbour is never visible. */
export const SLIDE_GAP = 6000;
