import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold, Code, Heading2, Heading3, Highlighter, Italic, Link2, List, ListCollapse, ListOrdered, Pilcrow, Quote, SquareCode, X
} from 'lucide-react';
import { CALLOUT_TONES, type CalloutTone } from './callout.ts';
import type { Visibility } from '../../domain/content.ts';
import { CODE_LANGUAGES } from './extensions.ts';
import { selectionContext } from './selection.ts';

export default function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ctx = selectionContext(e);
      return {
        bold: e.isActive('bold'), italic: e.isActive('italic'), code: e.isActive('code'), link: e.isActive('link'),
        h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
        bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'),
        codeBlock: e.isActive('codeBlock'), language: (e.getAttributes('codeBlock').language as string | undefined) ?? 'plaintext',
        blockType: ctx.block?.type.name ?? null,
        visibility: ((ctx.block?.attrs.visibility as Visibility | null) ?? 'always'),
        inCallout: e.isActive('callout'),
        tone: (e.getAttributes('callout').tone as CalloutTone | undefined) ?? 'mint',
        inDetails: e.isActive('details')
      };
    }
  });

  const chain = () => editor.chain().focus();
  const btn = (active: boolean, label: string, onClick: () => void, Icon: typeof Bold, shortcut?: string) => (
    <button type="button" className={`tb-btn${active ? ' is-on' : ''}`} aria-pressed={active} aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label} onMouseDown={e => e.preventDefault()} onClick={onClick}>
      <Icon size={17} aria-hidden="true" />
    </button>
  );

  function setVisibility(v: Visibility) {
    const { blockPos, block } = selectionContext(editor);
    if (blockPos === null || !block || block.type.name === 'heading') return;
    editor.chain().focus().command(({ tr }) => {
      tr.setNodeMarkup(blockPos, undefined, { ...block.attrs, visibility: v === 'always' ? null : v });
      return true;
    }).run();
  }

  function toggleLink() {
    if (editor.isActive('link')) { chain().unsetLink().run(); return; }
    const url = window.prompt('Link address (https://…)');
    if (url) chain().extendMarkRange('link').setLink({ href: url }).run();
  }

  const canFlag = s.blockType !== null && s.blockType !== 'heading';

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="tb-group">
        {btn(!s.h2 && !s.h3 && !s.codeBlock, 'Paragraph', () => chain().setParagraph().run(), Pilcrow)}
        {btn(s.h2, 'New section with its own slide (H2)', () => chain().toggleHeading({ level: 2 }).run(), Heading2, 'Ctrl+Alt+2')}
        {btn(s.h3, 'Sub-heading (H3)', () => chain().toggleHeading({ level: 3 }).run(), Heading3, 'Ctrl+Alt+3')}
      </div>
      <div className="tb-group">
        {btn(s.bold, 'Bold', () => chain().toggleBold().run(), Bold, 'Ctrl+B')}
        {btn(s.italic, 'Italic', () => chain().toggleItalic().run(), Italic, 'Ctrl+I')}
        {btn(s.code, 'Inline code', () => chain().toggleCode().run(), Code, 'Ctrl+E')}
        {btn(s.link, s.link ? 'Remove link' : 'Add link', toggleLink, Link2)}
      </div>
      <div className="tb-group">
        {btn(s.bullet, 'Bulleted list', () => chain().toggleBulletList().run(), List)}
        {btn(s.ordered, 'Numbered list', () => chain().toggleOrderedList().run(), ListOrdered)}
        {btn(s.quote, 'Quote', () => chain().toggleBlockquote().run(), Quote)}
        {btn(s.codeBlock, 'Code block', () => chain().toggleCodeBlock().run(), SquareCode, 'Ctrl+Alt+C')}
        {s.codeBlock && (
          <select className="tb-select" aria-label="Code language" value={s.language}
            onChange={e => chain().updateAttributes('codeBlock', { language: e.target.value }).run()}>
            {CODE_LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        )}
      </div>

      <div className="tb-group">
        {btn(s.inCallout, s.inCallout ? 'Highlight box (choose a tone)' : 'Highlight box: soft background around the current block(s)',
          () => { if (!s.inCallout) chain().setCallout(s.tone).run(); }, Highlighter)}
        {s.inCallout && (
          <>
            <span className="tb-tones" role="radiogroup" aria-label="Highlight tone">
              {CALLOUT_TONES.map(t => (
                <button key={t.value} type="button" role="radio" aria-checked={s.tone === t.value} title={t.name} aria-label={t.name}
                  className={`tb-tone tone-${t.value}${s.tone === t.value ? ' is-on' : ''}`} onMouseDown={e => e.preventDefault()}
                  onClick={() => chain().updateAttributes('callout', { tone: t.value }).run()} />
              ))}
            </span>
            {btn(false, 'Remove the highlight box (keeps the text)', () => chain().unsetCallout().run(), X)}
          </>
        )}
        {btn(s.inDetails, s.inDetails ? 'Remove collapsible (keeps the text)' : 'Collapsible: readers click its title to expand it',
          () => {
            if (s.inDetails) chain().unsetDetails().run();
            else chain().setDetails().updateAttributes('details', { open: true }).run();   // open while writing
          }, ListCollapse)}
      </div>

      <div className="tb-group" title="Who sees this block: everyone, only in Detailed mode, or only in Brief mode">
        <span className="tb-label">Show in</span>
        <div className="segmented segmented-sm" role="radiogroup" aria-label="Show this block in">
          {(['always', 'detail', 'brief'] as const).map(v => (
            <button key={v} type="button" role="radio" aria-checked={s.visibility === v} disabled={!canFlag}
              onMouseDown={e => e.preventDefault()} onClick={() => setVisibility(v)}>
              {v === 'always' ? 'Both' : v === 'detail' ? 'Detailed' : 'Brief'}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
