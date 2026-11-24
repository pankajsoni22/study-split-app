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
  // Readers can click a collapsible's title (not just its small arrow) to expand or collapse it.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const summary = (e.target as HTMLElement).closest('.collapsible summary');
    if (!summary || (e.target as HTMLElement).closest('a')) return;
    summary.closest('.collapsible')?.querySelector<HTMLButtonElement>(':scope > button')?.click();
  };
  return <div onClick={onClick}><EditorContent editor={editor} /></div>;
}
