/**
 * Callout node — Notion-style highlighted info block with leading icon.
 *
 * Renders as `<div data-type="callout" data-icon="…">…</div>` so it
 * round-trips through HTML/markdown serializers. The leading symbol is
 * stored in a single `icon` attribute that uses a tiny prefixed scheme:
 *
 *   - `name:foo`   → an icon from the host app's registry (e.g. `name:flame`)
 *   - `url:https…` → an external image URL (e.g. icons8 link)
 *   - anything else → treated as a literal grapheme (legacy emoji form)
 *
 * Pre-existing notes used a `data-emoji` attribute; `parseHTML` migrates
 * those silently so older content keeps rendering.
 */
import { Node, mergeAttributes } from '@tiptap/core';

const DEFAULT_ICON = 'name:info';

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: DEFAULT_ICON,
        parseHTML: (el) => {
          const explicit = el.getAttribute('data-icon');
          if (explicit) return explicit;
          // Back-compat: older notes stored a literal emoji in `data-emoji`.
          const legacy = el.getAttribute('data-emoji');
          if (legacy) return legacy;
          return DEFAULT_ICON;
        },
        renderHTML: (attrs) => ({ 'data-icon': String(attrs.icon ?? DEFAULT_ICON) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'continuum-callout' }),
      0,
    ];
  },
});
