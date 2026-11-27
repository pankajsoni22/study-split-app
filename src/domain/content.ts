// The article document model (docs §3, §12.1). Pure functions, no editor/vendor imports.
//
// A document is ProseMirror/TipTap-shaped JSON. Sections are not wrapper nodes: every level-2
// heading starts a new section (that keeps editing natural — Enter/Backspace work as usual).
// The heading carries the section's identity and its canvas link:
//   { type: 'heading', attrs: { level: 2, sectionId: 's_ab12', frameId: '<excalidraw frame id>' } }
// (Brief/Detailed reading levels were removed on 2026-11-26: every block is shown to every reader.)

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

/** ~220 words per minute, at least 1 minute when there is any text. */
export function readingMinutes(doc: Doc): number {
  const words = doc.content.map(textOf).join(' ').split(/\s+/).filter(Boolean).length;
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

/**
 * The editor keeps an empty paragraph at the end (so you can click below a final box or table and type). Adding it
 * when an article is opened, instead of on the editor's first event, stops a merely opened (or clicked) article from
 * looking edited. Returns the same doc when it already ends with a paragraph.
 */
export function ensureTrailingParagraph(doc: Doc): Doc {
  const last = doc.content[doc.content.length - 1];
  if (last?.type === 'paragraph') return doc;
  return { ...doc, content: [...doc.content, { type: 'paragraph' }] };
}
