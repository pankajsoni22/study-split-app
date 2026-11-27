import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Unfold markers in the editor (experimental): with Unfold on, each paragraph that has drawings shows its step
 * number in the margin, and the paragraph the cursor is in (where new drawings go) gets a teal edge.
 * The drawing side sends the counts with `setUnfoldMarks(editor, { on, counts })`.
 */
/** `linked`: the paragraph whose drawing parts are selected on the canvas (lit up in the text). */
export interface UnfoldMarksState { on: boolean; counts: Map<string, number>; linked?: string | null }
export const unfoldMarksKey = new PluginKey<UnfoldMarksState>('unfoldMarks');

export const UnfoldMarks = Extension.create({
  name: 'unfoldMarks',
  addProseMirrorPlugins() {
    return [new Plugin<UnfoldMarksState>({
      key: unfoldMarksKey,
      state: {
        init: () => ({ on: false, counts: new Map() }),
        apply: (tr, prev) => (tr.getMeta(unfoldMarksKey) as UnfoldMarksState | undefined) ?? prev
      },
      props: {
        decorations(state) {
          const marks = unfoldMarksKey.getState(state);
          if (!marks?.on) return null;
          const { $from } = state.selection;
          const current = $from.depth >= 1 ? $from.before(1) : -1;
          const decos: Decoration[] = [];
          let step = 0;
          state.doc.forEach((node, pos) => {
            if (node.type.name === 'heading' && node.attrs.level === 2) { step = 0; return; }
            step += 1;
            const id = node.attrs.blockId as string | null | undefined;
            const n = id ? marks.counts.get(id) ?? 0 : 0;
            const attrs: Record<string, string> = {};
            const cls: string[] = [];
            if (n > 0) { cls.push('unfold-has'); attrs['data-unfold-step'] = String(step); attrs.title = `Unfold step ${step}: ${n} drawing part${n === 1 ? '' : 's'} appear with this paragraph`; }
            if (pos === current) cls.push('unfold-target');
            if (id && id === marks.linked) cls.push('unfold-linked');
            if (cls.length) decos.push(Decoration.node(pos, pos + node.nodeSize, { ...attrs, class: cls.join(' ') }));
          });
          return DecorationSet.create(state.doc, decos);
        }
      }
    })];
  }
});

export function setUnfoldMarks(view: { state: { tr: import('@tiptap/pm/state').Transaction }; dispatch: (tr: import('@tiptap/pm/state').Transaction) => void }, marks: UnfoldMarksState) {
  view.dispatch(view.state.tr.setMeta(unfoldMarksKey, marks).setMeta('addToHistory', false));
}
