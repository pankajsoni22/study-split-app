import { newSectionId, type Doc, type DocNode } from './content.ts';
import type { LayoutId } from './layouts.ts';

// Starter templates (docs §6.5). Shipped in the bundle → zero DB calls. Every section gets its
// own split (text + drawing) automatically when the editor opens (one split per section).

interface TemplateSection {
  title: string;
  hint: string;
  frame?: boolean;
}

export interface Template {
  key: string;
  name: string;
  description: string;
  /** Default text:drawing layout (diagram-heavy templates give the drawing more room). */
  layout: LayoutId;
  sections: TemplateSection[];
}

export const TEMPLATES: Template[] = [
  {
    key: 'system-design', layout: '40-60', name: 'System Design', description: 'Requirements to deep dives, with a diagram for each step.',
    sections: [
      { title: 'Requirements', hint: 'Functional and non-functional requirements. What is in and out of scope?' },
      { title: 'Capacity estimates', hint: 'Users, requests per second, storage per year. Show the maths.' },
      { title: 'Core entities', hint: 'The main objects and how they relate.', frame: true },
      { title: 'API design', hint: 'Endpoints or RPCs with request and response shapes.' },
      { title: 'High-level design', hint: 'Walk through the main components and the request flow.', frame: true },
      { title: 'Deep dives', hint: 'Pick the hardest parts: scaling, consistency, caching, failure handling.', frame: true },
      { title: 'Trade-offs', hint: 'What you chose, what you gave up, and why.' },
      { title: 'Interview FAQ', hint: 'Q: … A: … — questions an interviewer is likely to ask.' }
    ]
  },
  {
    key: 'interview-experience', layout: '60-40', name: 'Interview Experience', description: 'Company, rounds, questions and what you learned.',
    sections: [
      { title: 'Overview', hint: 'Company, role, level, date, location/remote, final verdict.' },
      { title: 'Process', hint: 'How the rounds were laid out, from first call to offer.', frame: true },
      { title: 'Round 1', hint: 'What was asked, how you approached it, how it went.' },
      { title: 'Round 2', hint: 'Duplicate this section for each round.' },
      { title: 'Questions asked', hint: 'Q: … A: … — the questions, in one place for revision.' },
      { title: 'Preparation tips', hint: 'What helped, what you would do differently.' }
    ]
  },
  {
    key: 'software-project', layout: '50-50', name: 'Software Project', description: 'Problem, architecture, code and lessons learned.',
    sections: [
      { title: 'Problem', hint: 'Who has the problem and why it matters.' },
      { title: 'Architecture', hint: 'The building blocks and how data flows between them.', frame: true },
      { title: 'Tech stack', hint: 'What you used and why.' },
      { title: 'Data model', hint: 'Tables, documents or events.', frame: true },
      { title: 'Key code', hint: 'The most interesting piece of code, explained.' },
      { title: 'Results', hint: 'Numbers, users, performance, what shipped.' },
      { title: 'Lessons learned', hint: 'What you would do differently next time.' }
    ]
  },
  {
    key: 'dsa', layout: '50-50', name: 'DSA Problem', description: 'Intuition, approach, code and complexity.',
    sections: [
      { title: 'Problem', hint: 'Statement, constraints and an example.' },
      { title: 'Intuition', hint: 'How to think about it. Draw the example.', frame: true },
      { title: 'Approach', hint: 'Step by step.' },
      { title: 'Code', hint: 'Use a code block and pick the language.' },
      { title: 'Complexity', hint: 'Time and space, with reasoning.' },
      { title: 'Pitfalls', hint: 'Edge cases and common mistakes.' }
    ]
  },
  {
    key: 'concept', layout: '50-50', name: 'Concept Explainer', description: 'Explain one idea clearly, with a picture.',
    sections: [
      { title: 'TL;DR', hint: 'The idea in two sentences.' },
      { title: 'Why it matters', hint: 'The problem it solves.' },
      { title: 'How it works', hint: 'Mechanism, step by step.', frame: true },
      { title: 'Example', hint: 'A concrete, small example.', frame: true },
      { title: 'Trade-offs', hint: 'When to use it and when not to.' }
    ]
  },
  { key: 'blank', layout: '50-50', name: 'Blank', description: 'Start from an empty page.', sections: [] }
];

const paragraph = (text: string): DocNode => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });

/** Builds the starting document. Section ids are fresh; frames are linked later by the editor. */
export function buildTemplateDoc(template: Template): { doc: Doc; frameSections: { sectionId: string; title: string }[] } {
  const content: DocNode[] = [];
  const frameSections: { sectionId: string; title: string }[] = [];
  for (const s of template.sections) {
    const sectionId = newSectionId();
    content.push({ type: 'heading', attrs: { level: 2, sectionId, frameId: null }, content: [{ type: 'text', text: s.title }] });
    content.push(paragraph(s.hint));
    if (s.frame) frameSections.push({ sectionId, title: s.title });
  }
  if (content.length === 0) content.push(paragraph(''));
  return { doc: { type: 'doc', content }, frameSections };
}

export const templateByKey = (key: string | null | undefined) => TEMPLATES.find(t => t.key === key);
