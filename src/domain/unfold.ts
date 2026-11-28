// Unfold (2026-11-26; no longer experimental since 2026-11-28): a split's drawing builds up paragraph by paragraph as the reader goes.
// Pure rules, no Excalidraw/React imports (unit-tested in unfold.test.ts).
//
// - Every top-level block (paragraph, list, quote, code, highlight, collapsible, table, divider, sub-heading) has a
//   stable attrs.blockId. Split headings (H2) don't: they start the split.
// - A drawn element belongs to a step through element.customData.unfold = <blockId>. Untagged elements (and elements
//   whose paragraph no longer exists) are always visible. A label inside a shape follows its shape.
// - At step i of a split, the reader sees untagged elements plus every element of steps 0..i; step i's own elements
//   are "fresh" (they glow in).
import { isSectionHeading, type Doc, type DocNode } from './content.ts';

export const UNFOLD_KEY = 'unfold';

export function newBlockId(): string {
  return 'b_' + Math.random().toString(36).slice(2, 10);
}

/** Gives every top-level block (except split headings) a unique blockId. Returns the same doc if nothing changed. */
export function ensureBlockIds(doc: Doc): Doc {
  let changed = false;
  const seen = new Set<string>();
  const content = doc.content.map(n => {
    if (isSectionHeading(n)) return n;
    const id = n.attrs?.blockId;
    if (typeof id === 'string' && id && !seen.has(id)) { seen.add(id); return n; }
    changed = true;
    const fresh = newBlockId();
    seen.add(fresh);
    return { ...n, attrs: { ...n.attrs, blockId: fresh } };
  });
  return changed ? { ...doc, content } : doc;
}

/** The step ids of one split: its top-level blocks (heading excluded), in reading order. */
export function stepIds(nodes: DocNode[]): string[] {
  return nodes.filter(n => !isSectionHeading(n)).map(n => n.attrs?.blockId).filter((id): id is string => typeof id === 'string' && !!id);
}

interface El { id: string; type?: string; frameId?: string | null; containerId?: string | null; isDeleted?: boolean; customData?: Record<string, unknown> | null }

/** The blockId an element belongs to (labels follow their shape), or null. */
export function tagOf(el: El, byId: Map<string, El>): string | null {
  const own = el.customData?.[UNFOLD_KEY];
  if (typeof own === 'string' && own) return own;
  if (el.containerId) {
    const c = byId.get(el.containerId);
    const inherited = c?.customData?.[UNFOLD_KEY];
    if (typeof inherited === 'string' && inherited) return inherited;
  }
  return null;
}

/** True when an article uses Unfold: switched on and at least one element is tagged. */
export function usesUnfold(scene: { unfold?: boolean; elements: unknown[] }): boolean {
  if (!scene.unfold) return false;
  return (scene.elements as El[]).some(e => !e.isDeleted && typeof e.customData?.[UNFOLD_KEY] === 'string');
}

/**
 * What a reader sees in one split's frame at a step. `step` is an index into `steps` (-1 = before the first
 * paragraph: only untagged elements). Returns the visible element ids and the "fresh" ones (this step's own).
 */
export function visibleAt(elements: unknown[], frameId: string, steps: string[], step: number): { visible: Set<string>; fresh: Set<string> } {
  const els = (elements as El[]).filter(e => !e.isDeleted);
  const byId = new Map(els.map(e => [e.id, e]));
  const order = new Map(steps.map((id, i) => [id, i]));
  const visible = new Set<string>();
  const fresh = new Set<string>();
  for (const e of els) {
    const inFrame = e.frameId === frameId || (e.containerId && byId.get(e.containerId)?.frameId === frameId);
    if (!inFrame) continue;
    const tag = tagOf(e, byId);
    const at = tag === null ? -1 : (order.get(tag) ?? -1);   // unknown paragraph → always visible
    if (at <= step) visible.add(e.id);
    if (at === step && at >= 0) fresh.add(e.id);
  }
  return { visible, fresh };
}

/** Number of elements per step id in a frame (editor badges). */
export function countsByStep(elements: unknown[]): Map<string, number> {
  const els = (elements as El[]).filter(e => !e.isDeleted && e.type !== 'frame');
  const byId = new Map(els.map(e => [e.id, e]));
  const counts = new Map<string, number>();
  for (const e of els) {
    if (e.containerId) continue;   // a label counts with its shape
    const tag = tagOf(e, byId);
    if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return counts;
}
