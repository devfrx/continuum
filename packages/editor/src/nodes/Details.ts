/**
 * Toggle / Details node — Notion-style collapsible block.
 *
 * Persists as native `<details><summary>…</summary>…</details>` HTML so it
 * round-trips through markdown serializers and is screen-reader friendly.
 *
 * Structure:
 *   details
 *     ├─ detailsSummary (inline content — the clickable title)
 *     └─ detailsContent (block content — body shown when open)
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.hasAttribute('open'),
        renderHTML: (attrs) => (attrs.open ? { open: '' } : {}),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'details' },
      { tag: 'div[data-type="details"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Render as a plain <div> rather than native <details>; the Vue NodeView
    // owns the open/closed visual state, and using <details> here would let
    // the browser's native toggle race with our `open` attribute.
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'details',
        class: 'continuum-details',
      }),
      0,
    ];
  },
});

export const DetailsSummary = Node.create({
  name: 'detailsSummary',
  content: 'inline*',
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    // Accept native <summary> on paste/import for round-tripping, but render
    // as a plain <div> to avoid the browser's native disclosure marker
    // (which would visually duplicate our custom chevron).
    return [
      { tag: 'summary' },
      { tag: 'div[data-type="details-summary"]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'details-summary',
        class: 'continuum-details__summary',
      }),
      0,
    ];
  },
});

export const DetailsContent = Node.create({
  name: 'detailsContent',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="details-content"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'details-content',
        class: 'continuum-details__content',
      }),
      0,
    ];
  },
});