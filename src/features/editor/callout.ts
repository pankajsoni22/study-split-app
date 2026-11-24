import { mergeAttributes, Node } from '@tiptap/core';

/** Soft background tones for highlight boxes (light and dark values live in styles.css). */
export const CALLOUT_TONES = [
  { value: 'mint', name: 'Mint' }, { value: 'sand', name: 'Sand' }, { value: 'sky', name: 'Sky' },
  { value: 'lilac', name: 'Lilac' }, { value: 'peach', name: 'Peach' }, { value: 'paper', name: 'Paper' }
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number]['value'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selected blocks in a highlight box. */
      setCallout: (tone?: CalloutTone) => ReturnType;
      /** Take the content out of the box. */
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * Highlight box (decided 2026-11-24): a block with a soothing background that wraps other blocks
 * (paragraphs, lists, code…). Section headings (H2) belong outside boxes.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'mint',
        parseHTML: el => el.getAttribute('data-tone') ?? 'mint',
        renderHTML: attrs => ({ 'data-tone': String(attrs.tone) })
      }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'callout' }), 0];
  },

  addCommands() {
    return {
      setCallout: (tone = 'mint') => ({ commands }) => commands.wrapIn(this.name, { tone }),
      unsetCallout: () => ({ commands }) => commands.lift(this.name)
    };
  }
});
