import { EditorContent, useEditor } from '@tiptap/react';
import type { DocNode } from '../../domain/content.ts';
import { buildExtensions } from '../editor/extensions.ts';

const readerExtensions = buildExtensions({ editable: false });

/** One section, rendered read-only with the same schema as the editor (code highlighting included). */
export default function SectionView({ nodes }: { nodes: DocNode[] }) {
  const editor = useEditor({
    editable: false,
    immediatelyRender: true,
    extensions: readerExtensions,
    content: { type: 'doc', content: nodes.length ? nodes : [{ type: 'paragraph' }] },
    editorProps: { attributes: { class: 'prose prose-read' } }
  }, [nodes]);
  return <EditorContent editor={editor} />;
}
