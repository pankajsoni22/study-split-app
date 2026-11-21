import type { Editor } from '@tiptap/core';

export interface CurrentSection { sectionId: string; pos: number; title: string; frameId: string | null }

/** The top-level block under the cursor and the H2 section it belongs to. */
export function selectionContext(editor: Editor) {
  const { $from } = editor.state.selection;
  const depth = Math.min(1, $from.depth);
  const blockPos = depth >= 1 ? $from.before(1) : null;
  const block = depth >= 1 ? $from.node(1) : null;
  let section: CurrentSection | null = null;
  editor.state.doc.forEach((node, pos) => {
    if (pos <= $from.pos && node.type.name === 'heading' && node.attrs.level === 2 && node.attrs.sectionId) {
      section = { sectionId: node.attrs.sectionId as string, pos, title: node.textContent, frameId: (node.attrs.frameId as string | null) ?? null };
    }
  });
  return { blockPos, block, section: section as CurrentSection | null };
}

