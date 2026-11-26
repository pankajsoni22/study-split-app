import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  BetweenHorizontalEnd, BetweenVerticalEnd, Bold, ChevronDown, Code, Columns3, Grid2x2X, Heading2, Heading3, Highlighter, Italic,
  Link2, List, ListCollapse, ListOrdered, Minus, PanelTop, Pilcrow, Plus, Quote, Rows3, SquareCode, Table2, X
} from 'lucide-react';
import MenuButton from '../../ui/MenuButton.tsx';
import { CALLOUT_TONES, type CalloutTone } from './callout.ts';
import { CODE_LANGUAGES } from './extensions.ts';

/**
 * Formatting toolbar (compact layout, decided 2026-11-26): one row with
 *   [Style ▾: text / new split / sub-heading]  B I <> link  • 1. ❝ {}  [+ Insert ▾]  …block options…   (full screen)
 * Colour pickers, code language and table controls appear only inside that kind of block.
 */
type StyleKey = 'text' | 'split' | 'sub';
const STYLES: { key: StyleKey; label: string; hint: string; Icon: typeof Bold; shortcut?: string }[] = [
  { key: 'text', label: 'Text', hint: 'A normal paragraph', Icon: Pilcrow, shortcut: 'Ctrl+Alt+0' },
  { key: 'split', label: 'New split', hint: 'Starts a split: text + its drawing', Icon: Heading2, shortcut: 'Ctrl+Alt+2' },
  { key: 'sub', label: 'Sub-heading', hint: 'A heading inside this split', Icon: Heading3, shortcut: 'Ctrl+Alt+3' }
];

export default function Toolbar({ editor, trailing }: { editor: Editor; trailing?: React.ReactNode }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), code: e.isActive('code'), link: e.isActive('link'),
      style: (e.isActive('heading', { level: 2 }) ? 'split' : e.isActive('heading', { level: 3 }) ? 'sub' : 'text'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'), codeBlock: e.isActive('codeBlock'),
      language: (e.getAttributes('codeBlock').language as string | undefined) ?? 'plaintext',
      inCallout: e.isActive('callout'),
      tone: (e.getAttributes('callout').tone as CalloutTone | undefined) ?? 'mint',
      inDetails: e.isActive('details'),
      detailsTone: (e.getAttributes('details').tone as CalloutTone | null | undefined) ?? null,
      inTable: e.isActive('table')
    })
  });

  const chain = () => editor.chain().focus();
  const btn = (active: boolean, label: string, onClick: () => void, Icon: typeof Bold, shortcut?: string) => (
    <button type="button" className={`tb-btn${active ? ' is-on' : ''}`} aria-pressed={active} aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label} onMouseDown={e => e.preventDefault()} onClick={onClick}>
      <Icon size={17} aria-hidden="true" />
    </button>
  );
  const item = (label: string, Icon: typeof Bold, onClick: () => void, { active = false, hint = '', shortcut = '' } = {}) => (
    <button key={label} type="button" role="menuitem" className={`menu-item${active ? ' is-active' : ''}`}
      onMouseDown={e => e.preventDefault()} onClick={onClick} title={shortcut ? `${label} (${shortcut})` : label}>
      <Icon size={16} aria-hidden="true" />
      <span className="menu-item-text">{label}{hint && <small>{hint}</small>}</span>
      {shortcut && <kbd className="menu-kbd">{shortcut}</kbd>}
    </button>
  );

  function setStyle(key: StyleKey) {
    const c = chain();
    if (key === 'text') c.setParagraph().run();
    else if (key === 'split') c.setHeading({ level: 2 }).run();
    else c.setHeading({ level: 3 }).run();
  }

  function toggleLink() {
    if (editor.isActive('link')) { chain().unsetLink().run(); return; }
    const url = window.prompt('Link address (https://…)');
    if (url) chain().extendMarkRange('link').setLink({ href: url }).run();
  }

  const current = STYLES.find(x => x.key === s.style) ?? STYLES[0]!;
  const tones = (value: CalloutTone | null, onPick: (t: CalloutTone | null) => void, label: string, withNone: boolean) => (
    <span className="tb-tones" role="radiogroup" aria-label={label}>
      {withNone && (
        <button type="button" role="radio" aria-checked={value === null} title="No colour" aria-label="No colour"
          className={`tb-tone tone-none${value === null ? ' is-on' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => onPick(null)} />
      )}
      {CALLOUT_TONES.map(t => (
        <button key={t.value} type="button" role="radio" aria-checked={value === t.value} title={t.name} aria-label={`${label}: ${t.name}`}
          className={`tb-tone tone-${t.value}${value === t.value ? ' is-on' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => onPick(t.value)} />
      ))}
    </span>
  );

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <MenuButton label={`Text style: ${current.label}`} align="left" buttonClassName="tb-style"
        trigger={<><current.Icon size={16} aria-hidden="true" /><span className="tb-style-label">{current.label}</span><ChevronDown size={14} aria-hidden="true" /></>}>
        {close => STYLES.map(st => item(st.label, st.Icon, () => { setStyle(st.key); close(); },
          { active: st.key === s.style, hint: st.hint, shortcut: st.shortcut }))}
      </MenuButton>

      <div className="tb-group">
        {btn(s.bold, 'Bold', () => chain().toggleBold().run(), Bold, 'Ctrl+B')}
        {btn(s.italic, 'Italic', () => chain().toggleItalic().run(), Italic, 'Ctrl+I')}
        {btn(s.code, 'Inline code', () => chain().toggleCode().run(), Code, 'Ctrl+E')}
        {btn(s.link, s.link ? 'Remove link' : 'Add link', toggleLink, Link2)}
      </div>

      <div className="tb-group">
        {btn(s.bullet, 'Bulleted list', () => chain().toggleBulletList().run(), List, 'Ctrl+Shift+8')}
        {btn(s.ordered, 'Numbered list', () => chain().toggleOrderedList().run(), ListOrdered, 'Ctrl+Shift+7')}
        {btn(s.quote, 'Quote', () => chain().toggleBlockquote().run(), Quote, 'Ctrl+Shift+B')}
        {btn(s.codeBlock, 'Code block', () => chain().toggleCodeBlock().run(), SquareCode, 'Ctrl+Alt+C')}
      </div>

      <MenuButton label="Insert" align="left" buttonClassName="tb-style tb-insert"
        trigger={<><Plus size={16} aria-hidden="true" /><span className="tb-style-label">Insert</span><ChevronDown size={14} aria-hidden="true" /></>}>
        {close => [
          item('Table', Table2, () => { chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); close(); }, { hint: '3 × 3, first row is the header' }),
          item('Highlight', Highlighter, () => { if (!s.inCallout) chain().setCallout(s.tone).run(); close(); }, { hint: 'Soft background around the block' }),
          item('Collapsible', ListCollapse, () => { if (!s.inDetails) chain().setDetails().updateAttributes('details', { open: true }).run(); close(); },
            { hint: 'Readers click its title to expand it' }),
          item('Divider', Minus, () => { chain().setHorizontalRule().run(); close(); }, { hint: 'A thin line between parts' })
        ]}
      </MenuButton>

      {(s.codeBlock || s.inCallout || s.inDetails || s.inTable) && (
        <div className="tb-context" aria-label="Options for this block">
          {s.codeBlock && (
            <select className="tb-select" aria-label="Code language" value={s.language}
              onChange={e => chain().updateAttributes('codeBlock', { language: e.target.value }).run()}>
              {CODE_LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          {s.inCallout && (
            <span className="tb-context-part">
              <span className="tb-label">Highlight</span>
              {tones(s.tone, t => { if (t) chain().updateAttributes('callout', { tone: t }).run(); }, 'Highlight colour', false)}
              {btn(false, 'Remove the highlight (keeps the text)', () => chain().unsetCallout().run(), X)}
            </span>
          )}
          {s.inDetails && (
            <span className="tb-context-part">
              <span className="tb-label">Collapsible</span>
              {tones(s.detailsTone, t => chain().updateAttributes('details', { tone: t }).run(), 'Collapsible colour', true)}
              {btn(false, 'Remove collapsible (keeps the text)', () => chain().unsetDetails().run(), X)}
            </span>
          )}
          {s.inTable && (
            <span className="tb-context-part">
              <span className="tb-label">Table</span>
              {btn(false, 'Add a row below', () => chain().addRowAfter().run(), BetweenHorizontalEnd)}
              {btn(false, 'Add a column to the right', () => chain().addColumnAfter().run(), BetweenVerticalEnd)}
              {btn(false, 'Delete this row', () => chain().deleteRow().run(), Rows3)}
              {btn(false, 'Delete this column', () => chain().deleteColumn().run(), Columns3)}
              {btn(false, 'Header row on / off', () => chain().toggleHeaderRow().run(), PanelTop)}
              {btn(false, 'Delete the table', () => chain().deleteTable().run(), Grid2x2X)}
            </span>
          )}
        </div>
      )}

      {trailing && <div className="tb-trailing">{trailing}</div>}
    </div>
  );
}
