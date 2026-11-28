import { ChevronDown, ChevronRight, ListTree } from 'lucide-react';
import { textOf, type Section } from '../../domain/content.ts';
import MenuButton from '../../ui/MenuButton.tsx';

// Shared by the reader AND the editor (2026-11-28): one way to see where you are and jump, whether reading or writing.

/** Sub-headings (H3) of a split, for Contents. */
function subHeadings(section: Section): string[] {
  return section.nodes.filter(n => n.type === 'heading' && n.attrs?.level === 3).map(n => textOf(n).trim() || 'Untitled');
}

/** Contents: every split; the current one expands to show its sub-headings. Used in the reader bar menu and Article view. */
export function Contents({ sections, current, onPick, menu = false }: {
  sections: Section[]; current: string | null; onPick: (sectionId: string, sub: number | null) => void; menu?: boolean;
}) {
  return (
    <ol className={`contents${menu ? ' contents-menu' : ''}`}>
      {sections.map((sec, i) => {
        const on = sec.id === current;
        const subs = on ? subHeadings(sec) : [];
        return (
          <li key={sec.id} className={on ? 'is-current' : ''}>
            <button type="button" role={menu ? 'menuitem' : undefined} className={`contents-split${on ? ' is-on' : ''}`}
              aria-current={on ? 'location' : undefined} onClick={() => onPick(sec.id, null)}>
              <span className="contents-num">{i + 1}</span><span className="contents-title">{sec.title}</span>
            </button>
            {subs.length > 0 && (
              <ol className="contents-subs">
                {subs.map((t, j) => (
                  <li key={j}>
                    <button type="button" role={menu ? 'menuitem' : undefined} className="contents-sub" onClick={() => onPick(sec.id, j)}>{t}</button>
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Breadcrumb chip after the article title: "› [3/9 Finding a key's server ▾]". It shows the current split and opens
 * Contents. Same in the reader bar and the editor bar.
 */
export function SplitCrumb({ sections, current, onPick }: {
  sections: Section[]; current: string | null; onPick: (sectionId: string, sub: number | null) => void;
}) {
  const index = Math.max(0, sections.findIndex(x => x.id === current));
  const section = sections[index];
  if (sections.length < 2 || !section) return null;
  return (
    <>
      <ChevronRight size={15} className="crumb-sep" aria-hidden="true" />
      <MenuButton label={`Contents: you are on split ${index + 1} of ${sections.length}, ${section.title}. Jump to another split`}
        align="left" buttonClassName="crumb-split"
        trigger={(
          <>
            <ListTree size={14} aria-hidden="true" className="crumb-icon" />
            <span className="crumb-num">{index + 1}<small>/{sections.length}</small></span>
            <span className="crumb-title">{section.title}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </>
        )}>
        {close => <Contents sections={sections} current={current} onPick={(id, sub) => { close(); onPick(id, sub); }} menu />}
      </MenuButton>
    </>
  );
}
