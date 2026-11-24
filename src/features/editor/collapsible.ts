import { Details } from '@tiptap/extension-details';

/**
 * Collapsible block = TipTap Details + an optional `tone` (same palette as highlight boxes; none = plain).
 * Details' own node view only refreshes its open state on update, so the tone is re-applied here.
 */
export const Collapsible = Details.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tone: {
        default: null,
        parseHTML: el => el.getAttribute('data-tone'),
        renderHTML: attrs => (attrs.tone ? { 'data-tone': String(attrs.tone) } : {})
      }
    };
  },

  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return props => {
      const view = parent(props);
      const dom = view.dom;
      const applyTone = (tone: unknown) => {
        if (typeof tone === 'string' && tone) dom.setAttribute('data-tone', tone);
        else dom.removeAttribute('data-tone');
      };
      applyTone(props.node.attrs.tone);
      const update = view.update?.bind(view);
      view.update = (node, ...rest) => {
        const ok = update ? update(node, ...rest) : false;
        if (ok) applyTone(node.attrs.tone);
        return ok;
      };
      return view;
    };
  }
});
