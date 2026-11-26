import { Extension, type AnyExtension } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { newSectionId } from '../../domain/content.ts';
import { Callout } from './callout.ts';
import { Collapsible } from './collapsible.ts';

export const lowlight = createLowlight(common);

/** Languages offered in the code-block picker (all included in lowlight's "common" set). */
export const CODE_LANGUAGES = [
  ['plaintext', 'Plain text'], ['python', 'Python'], ['java', 'Java'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'],
  ['go', 'Go'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['kotlin', 'Kotlin'], ['rust', 'Rust'], ['sql', 'SQL'],
  ['bash', 'Shell'], ['json', 'JSON'], ['yaml', 'YAML'], ['xml', 'HTML/XML'], ['css', 'CSS']
] as const;

/**
 * Study Split's document attributes (docs §12.1):
 * - H2 headings: sectionId + frameId (section ↔ canvas frame link: one "split")
 * Plus a guard that keeps sectionIds unique when a heading is split or pasted twice.
 */
const StudySplitAttrs = Extension.create({
  name: 'studySplitAttrs',
  addGlobalAttributes() {
    return [
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
    Callout,
    // Collapsible blocks (decided 2026-11-24): the writer's open/closed state is kept while editing (persist),
    // but readers always start collapsed and toggle without changing the article (no persist).
    Collapsible.configure({ persist: editable, openWithoutDelay: true, HTMLAttributes: { class: 'collapsible' } }),
    DetailsSummary,
    DetailsContent,
    // Tables (added 2026-11-25): first row is a header row by default. Writers can resize columns; readers get a
    // wrapper that scrolls sideways on narrow screens instead of squeezing the columns.
    TableKit.configure({ table: { resizable: editable, renderWrapper: true, HTMLAttributes: { class: 'ss-table' } } }),
    StudySplitAttrs,
    ...(editable ? [Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Section title'
        : node.type.name === 'detailsSummary' ? 'Title readers click to expand'
        : 'Write here… (Ctrl+Alt+2 for a new section)')
    })] : [])
  ];
}
