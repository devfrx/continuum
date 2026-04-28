/**
 * Callout node — Notion-style highlighted info block with leading emoji.
 *
 * Renders as `<div data-type="callout" data-emoji="💡">…</div>` so it
 * round-trips through HTML/markdown serializers. The emoji is stored as a
 * single attribute and rendered with `contenteditable="false"` to keep it
 * out of the document's text flow.
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: (el) => el.getAttribute('data-emoji') ?? '💡',
        renderHTML: (attrs) => ({ 'data-emoji': String(attrs.emoji ?? '💡') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const emoji = String(node.attrs.emoji ?? '💡');
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'lore-callout' }),
      ['div', { class: 'lore-callout__emoji', contenteditable: 'false' }, emoji],
      ['div', { class: 'lore-callout__body' }, 0],
    ];
  },
});
