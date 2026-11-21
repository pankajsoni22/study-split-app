// Study Split's drawing format bar (decided 2026-11-22): pure logic, no Excalidraw imports, unit-tested.
// Works on plain element objects; src/features/canvas/excalidraw.ts applies the result to the scene.

export const STROKE_COLORS = [
  { value: '#1e1e1e', name: 'Ink' }, { value: '#0e7c6b', name: 'Verdigris' }, { value: '#e9a23b', name: 'Amber' },
  { value: '#2557d6', name: 'Blue' }, { value: '#c2410c', name: 'Red' }, { value: '#7c3aed', name: 'Purple' },
  { value: '#15803d', name: 'Green' }, { value: '#6b6760', name: 'Grey' }
] as const;

export const FILL_COLORS = [
  { value: 'transparent', name: 'None' }, { value: '#e3f3ef', name: 'Mint' }, { value: '#fbefd9', name: 'Sand' },
  { value: '#e0e9ff', name: 'Sky' }, { value: '#fde4dc', name: 'Peach' }, { value: '#ede4ff', name: 'Lilac' },
  { value: '#dcfce7', name: 'Leaf' }, { value: '#eeece7', name: 'Paper' }
] as const;

/** Excalidraw font family ids (FONT_FAMILY in Excalidraw 0.18). */
export const FONTS = [
  { value: 5, name: 'Hand-drawn' },   // Excalifont
  { value: 6, name: 'Normal' },       // Nunito
  { value: 8, name: 'Code' }          // Comic Shanns
] as const;
export const FONT_SIZES = [{ value: 16, name: 'S' }, { value: 20, name: 'M' }, { value: 28, name: 'L' }, { value: 36, name: 'XL' }] as const;

export type StyleKey =
  | 'strokeColor' | 'backgroundColor' | 'fillStyle' | 'strokeWidth' | 'strokeStyle'
  | 'roughness' | 'roundness' | 'fontFamily' | 'fontSize' | 'textAlign';

/** Format-bar values. roundness is simplified to 'round' | 'sharp'. */
export type StyleValue = string | number;

/** appState key that holds the default for new shapes. */
export const CURRENT_ITEM_KEY: Record<StyleKey, string> = {
  strokeColor: 'currentItemStrokeColor', backgroundColor: 'currentItemBackgroundColor', fillStyle: 'currentItemFillStyle',
  strokeWidth: 'currentItemStrokeWidth', strokeStyle: 'currentItemStrokeStyle', roughness: 'currentItemRoughness',
  roundness: 'currentItemRoundness', fontFamily: 'currentItemFontFamily', fontSize: 'currentItemFontSize', textAlign: 'currentItemTextAlign'
};

export interface El {
  id: string;
  type: string;
  isDeleted?: boolean;
  containerId?: string | null;
  roundness?: { type: number } | null;
  [key: string]: unknown;
}

const FILLABLE = new Set(['rectangle', 'ellipse', 'diamond']);
const EDGED = new Set(['rectangle', 'diamond']);
const LINEAR = new Set(['arrow', 'line']);
const TEXT_KEYS = new Set<StyleKey>(['fontFamily', 'fontSize', 'textAlign']);

export interface Kinds { fill: boolean; edges: boolean; stroke: boolean; text: boolean }
export interface Summary {
  /** Number of selected elements (0 = the bar edits the defaults for new shapes). */
  count: number;
  kinds: Kinds;
  /** Shared value per key; undefined when the selection is mixed. */
  values: Partial<Record<StyleKey, StyleValue>>;
}

const live = (elements: readonly El[]) => elements.filter(e => !e.isDeleted);

/** Selected elements plus text bound inside selected containers (labels follow their shape). */
export function selectionWithLabels(elements: readonly El[], selected: Record<string, boolean>): El[] {
  return live(elements).filter(e => selected[e.id] || (e.containerId && selected[e.containerId]));
}

/** Which elements a style key applies to. */
function appliesTo(key: StyleKey, e: El): boolean {
  if (e.type === 'frame') return false;
  switch (key) {
    case 'strokeColor': return true;
    case 'backgroundColor': case 'fillStyle': return FILLABLE.has(e.type);
    case 'roundness': return EDGED.has(e.type);
    case 'strokeWidth': case 'strokeStyle': case 'roughness': return e.type !== 'text';
    default: return TEXT_KEYS.has(key) && e.type === 'text';
  }
}

function read(key: StyleKey, e: El): StyleValue {
  if (key === 'roundness') return e.roundness ? 'round' : 'sharp';
  return e[key] as StyleValue;
}

export function summarize(elements: readonly El[], selected: Record<string, boolean>, appState: Record<string, unknown>): Summary {
  const sel = selectionWithLabels(elements, selected);
  const keys = Object.keys(CURRENT_ITEM_KEY) as StyleKey[];
  if (sel.filter(e => selected[e.id]).length === 0) {
    const tool = (appState.activeTool as { type?: string } | undefined)?.type;
    return {
      count: 0,
      kinds: { fill: true, edges: true, stroke: true, text: tool === 'text' },
      values: Object.fromEntries(keys.map(k => [k, appState[CURRENT_ITEM_KEY[k]] as StyleValue]))
    };
  }
  const values: Partial<Record<StyleKey, StyleValue>> = {};
  for (const k of keys) {
    const vals = new Set(sel.filter(e => appliesTo(k, e)).map(e => read(k, e)));
    if (vals.size === 1) values[k] = [...vals][0];
  }
  return {
    count: sel.filter(e => selected[e.id]).length,
    kinds: {
      fill: sel.some(e => FILLABLE.has(e.type)),
      edges: sel.some(e => EDGED.has(e.type)),
      stroke: sel.some(e => e.type !== 'text' || LINEAR.has(e.type)),
      text: sel.some(e => e.type === 'text')
    },
    values
  };
}

/** Patches to apply for one format-bar change: element id → partial element. */
export function restyle(elements: readonly El[], selected: Record<string, boolean>, key: StyleKey, value: StyleValue): Map<string, Partial<El>> {
  const patches = new Map<string, Partial<El>>();
  for (const e of selectionWithLabels(elements, selected)) {
    if (!appliesTo(key, e)) continue;
    if (key === 'roundness') patches.set(e.id, { roundness: value === 'round' ? { type: 3 } : null });   // ADAPTIVE_RADIUS
    else patches.set(e.id, { [key]: value });
  }
  return patches;
}

/** z-order: selected (with their labels) to the front or back, keeping everything else in order. */
export function reorder(elements: readonly El[], selected: Record<string, boolean>, to: 'front' | 'back'): El[] {
  const moving = new Set(selectionWithLabels(elements, selected).map(e => e.id));
  const stay = elements.filter(e => !moving.has(e.id));
  const move = elements.filter(e => moving.has(e.id));
  if (to === 'front') return [...stay, ...move];
  // Back = just behind everything else but still after frames, so frames keep their outline on top of nothing odd.
  const lastFrame = stay.reduce((i, e, idx) => (e.type === 'frame' ? idx : i), -1);
  return [...stay.slice(0, lastFrame + 1), ...move, ...stay.slice(lastFrame + 1)];
}
