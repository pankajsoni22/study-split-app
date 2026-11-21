import { Extension, type AnyExtension } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Placeholder } from '@tiptap/extensions';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { newSectionId } from '../../domain/content.ts';

export const lowlight = createLowlight(common);

/** Languages offered in the code-block picker (all included in lowlight's "common" set). */
export const CODE_LANGUAGES = [
  ['plaintext', 'Plain text'], ['python', 'Python'], ['java', 'Java'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['go', 'Go'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['kotlin', 'Kotlin'], ['rust', 'Rust'], ['sql', 'SQL'],
  ['bash', 'Shell'], ['json', 'JSON'], ['yaml', 'YAML'], ['xml', 'HTML/XML'], ['css', 'CSS']
] as const;

const BLOCK_TYPES = ['paragraph', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule'];

/**
 * Study Split's document attributes (docs §12.1):
 * - every block: visibility = always | detail | brief  (Brief/Detailed reading levels)
 * - H2 headings: sectionId + frameId (section ↔ canvas frame link)
 * Plus a guard that keeps sectionIds unique when a heading is split or pasted twice.
 */
const StudySplitAttrs = Extension.create({
  name: 'studySplitAttrs',
  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          visibility: {
            default: null,
            keepOnSplit: true,
            parseHTML: el => el.getAttribute('data-visibility'),
            renderHTML: attrs => (attrs.visibility === 'detail' || attrs.visibility === 'brief' ? { 'data-visibility': String(attrs.visibility) } : {})
          }
        }
      },
      {
        types: ['heading'],
        attributes: {
          sectionId: {
            default: null,
            keepOnSplit: false,
            parseHTML: el => el.getAttribute('data-section-id'),
            renderHTML: attrs => (attrs.sectionId ? { 'data-section-id': String(attrs.sectionId) } : {})
          },
          frameId: {
            default: null,
            keepOnSplit: false,
            parseHTML: el => el.getAttribute('data-frame-id'),
            renderHTML: attrs => (attrs.frameId ? { 'data-frame-id': String(attrs.frameId) } : {})
          }
        }
      }
    ];
  },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('uniqueSectionIds'),
      appendTransaction: (transactions, _old, state) => {
        if (!transactions.some(t => t.docChanged)) return null;
        const seen = new Set<string>();
        let tr = state.tr;
        let changed = false;
        state.doc.forEach((node, pos) => {
          if (node.type.name !== 'heading' || node.attrs.level !== 2) return;
          const id = node.attrs.sectionId as string | null;
          if (!id || seen.has(id)) {
            const fresh = newSectionId();
            seen.add(fresh);
            tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, sectionId: fresh, frameId: id ? null : (node.attrs.frameId as string | null) });
            changed = true;
          } else {
            seen.add(id);
          }
        });
        return changed ? tr : null;
      }
    })];
  }
});

export function buildExtensions({ editable }: { editable: boolean }): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [2, 3] },
      link: { openOnClick: !editable, autolink: true, defaultProtocol: 'https', HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } }
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    StudySplitAttrs,
    ...(editable ? [Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Section title' : 'Write here… (Ctrl+Alt+2 for a new section)')
    })] : [])
  ];
}
