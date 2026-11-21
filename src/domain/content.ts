// The article document model (docs §3, §12.1). Pure functions, no editor/vendor imports.
//
// A document is ProseMirror/TipTap-shaped JSON. Sections are not wrapper nodes: every level-2
// heading starts a new section (that keeps editing natural — Enter/Backspace work as usual).
// The heading carries the section's identity and its canvas link:
//   { type: 'heading', attrs: { level: 2, sectionId: 's_ab12', frameId: '<excalidraw frame id>' } }
// Any block may carry attrs.visibility: 'always' (default) | 'detail' | 'brief'.

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface Doc extends DocNode {
  type: 'doc';
  content: DocNode[];
}

export type Visibility = 'always' | 'detail' | 'brief';
export type ReadingLevel = 'detailed' | 'brief';

export interface Section {
  /** Stable id; "intro" for content before the first H2. */
  id: string;
  title: string;
  frameId: string | null;
  /** Top-level nodes of the section, including its heading. */
  nodes: DocNode[];
}

export const emptyDoc = (): Doc => ({ type: 'doc', content: [] });

export function newSectionId(): string {
  return 's_' + Math.random().toString(36).slice(2, 10);
}

export const isSectionHeading = (n: DocNode) => n.type === 'heading' && n.attrs?.level === 2;

export function visibilityOf(n: DocNode): Visibility {
  const v = n.attrs?.visibility;
  return v === 'detail' || v === 'brief' ? v : 'always';
}

/** Plain text of a node tree. */
export function textOf(n: DocNode): string {
  if (n.text) return n.text;
  return (n.content ?? []).map(textOf).join(n.type === 'paragraph' || n.type === 'heading' ? '' : ' ');
}

export function splitSections(doc: Doc): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const node of doc.content) {
    if (isSectionHeading(node)) {
      current = {
        id: typeof node.attrs?.sectionId === 'string' ? node.attrs.sectionId : `h_${sections.length}`,
        title: textOf(node).trim() || 'Untitled section',
        frameId: typeof node.attrs?.frameId === 'string' && node.attrs.frameId ? node.attrs.frameId : null,
        nodes: [node]
      };
      sections.push(current);
    } else {
      if (!current) {
        current = { id: 'intro', title: 'Introduction', frameId: null, nodes: [] };
        sections.push(current);
      }
      current.nodes.push(node);
    }
  }
  return sections;
}

/** Drops blocks that don't belong to the chosen reading level (docs §4.1). Headings always stay. */
export function filterForLevel(nodes: DocNode[], level: ReadingLevel): DocNode[] {
  return nodes.filter(n => {
    if (n.type === 'heading') return true;
    const v = visibilityOf(n);
    return v === 'always' || (level === 'detailed' ? v === 'detail' : v === 'brief');
  });
}

/** True when the Brief/Detailed toggle should be offered (some block is not "always"). */
export function hasBriefContent(doc: Doc): boolean {
  return doc.content.some(n => visibilityOf(n) !== 'always');
}

/** ~220 words per minute on the detailed version, at least 1 minute when there is any text. */
export function readingMinutes(doc: Doc): number {
  const words = filterForLevel(doc.content, 'detailed').map(textOf).join(' ').split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : Math.max(1, Math.round(words / 220));
}

/** Gives every H2 a sectionId (needed to link frames and remember reading position). Returns a new doc if changed. */
export function ensureSectionIds(doc: Doc): Doc {
  let changed = false;
  const content = doc.content.map(n => {
    if (isSectionHeading(n) && typeof n.attrs?.sectionId !== 'string') {
      changed = true;
      return { ...n, attrs: { ...n.attrs, sectionId: newSectionId() } };
    }
    return n;
  });
  return changed ? { ...doc, content } : doc;
}
