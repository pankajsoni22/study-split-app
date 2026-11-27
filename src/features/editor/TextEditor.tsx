import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Doc } from '../../domain/content.ts';
import { buildExtensions } from './extensions.ts';
import { selectionContext, type CurrentSection } from './selection.ts';
import Toolbar from './Toolbar.tsx';

/** Rich-text side of the editor. Reports content changes and which section the cursor is in. */
export default function TextEditor({ initialDoc, onReady, onChange, onActiveSection, onActiveBlock, trailing }: {
  /** Unfold: the top-level block (paragraph, list…) the cursor is in, by blockId. */
  onActiveBlock?: (blockId: string | null) => void;
  /** Shown at the right end of the formatting toolbar (e.g. the full-screen button). */
  trailing?: React.ReactNode;
  initialDoc: Doc;
  onReady: (editor: Editor) => void;
  onChange: (doc: Doc) => void;
  onActiveSection: (section: CurrentSection | null) => void;
}) {
  const callbacks = useRef({ onChange, onActiveSection, onActiveBlock });
  useEffect(() => { callbacks.current = { onChange, onActiveSection, onActiveBlock }; });
  const lastSection = useRef<string | null>(null);
  const lastBlock = useRef<string | null | undefined>(undefined);
  const alive = useRef(true);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const editor = useEditor({
    extensions: buildExtensions({ editable: true }),
    content: initialDoc,
    immediatelyRender: true,
    editorProps: { attributes: { class: 'prose prose-edit', 'aria-label': 'Article text', spellcheck: 'true' } },
    onUpdate: ({ editor: e }) => { if (alive.current) callbacks.current.onChange(e.getJSON() as Doc); },
    onSelectionUpdate: ({ editor: e }) => {
      const { section, block } = selectionContext(e);
      const isSplit = block?.type.name === 'heading' && block.attrs.level === 2;
      const blockId = !block || isSplit ? null : ((block.attrs.blockId as string | null) ?? null);
      if (blockId !== lastBlock.current) { lastBlock.current = blockId; callbacks.current.onActiveBlock?.(blockId); }
      const key = section ? section.sectionId : null;
      if (key === lastSection.current) return;
      lastSection.current = key;
      callbacks.current.onActiveSection(section);
    }
  });

  useEffect(() => { if (editor) onReady(editor); }, [editor, onReady]);

  if (!editor) return null;
  return (
    <div className="text-editor">
      <Toolbar editor={editor} trailing={trailing} />
      <EditorContent editor={editor} className="editor-scroll" />
    </div>
  );
}
