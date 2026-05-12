/**
 * Footnote node — inline atom carrying its own text content as an
 * attribute. Renders as a clickable superscript marker (`[n]`) inline
 * with the surrounding text; the actual footnote body is edited via a
 * popover surfaced by the Vue NodeView, and rendered as a numbered list
 * in a companion panel below the editor (see `NoteFootnotesPanel.vue`).
 *
 * Why an atom-with-attribute (instead of an inline node with `inline*`
 * children + a separate `footnoteList` block):
 *
 *   1. ProseMirror does not allow an inline node to contain block content,
 *      so a "popover with paragraphs" model would require either a hidden
 *      block at the document end (raising sync/ordering problems on every
 *      edit) or a brittle inline-only body that breaks line-wrapping.
 *   2. Auto-numbering becomes a pure read of the document order
 *      (`extractFootnotes`) — no separate ID space, no orphan cleanup.
 *   3. Round-trips losslessly through HTML: the body lives in
 *      `data-footnote` so external tools see a self-contained
 *      `<sup data-type="footnote" data-footnote="…">…</sup>`.
 *
 * Attribute schema:
 *   - `content` (string) — the footnote body, plain text. Newlines are
 *     preserved; markdown is intentionally not interpreted in v1 to keep
 *     the popover and the summary panel in lockstep.
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const FOOTNOTE_NODE_NAME = 'footnote';

export const Footnote = Node.create({
  name: FOOTNOTE_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      content: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-footnote') ?? '',
        renderHTML: (attrs) => ({
          'data-footnote': String(attrs.content ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'sup[data-type="footnote"]' },
      // Back-compat / friendly paste: any <sup data-footnote="…"> works.
      { tag: 'sup[data-footnote]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'footnote',
        class: 'continuum-footnote',
      }),
      // The displayed marker (e.g. "[1]") is computed live by the Vue
      // NodeView from document order, so the static HTML payload only
      // carries a placeholder bullet for non-Tiptap consumers.
      '*',
    ];
  },
});

/**
 * A single footnote extracted from a Tiptap JSON document, in document
 * order. The `index` is 1-based and shared between the inline marker and
 * the bottom-of-page summary panel — single source of truth.
 */
export interface ExtractedFootnote {
  index: number;
  content: string;
}

/**
 * Walk a Tiptap JSON document and collect every `footnote` atom in the
 * order they appear. Used by the host to render an auto-numbered summary
 * (`NoteFootnotesPanel.vue`) without needing access to the live editor.
 *
 * Tolerant by design: any node shape that doesn't match `{ type, content }`
 * is silently skipped so partially-loaded / pre-Footnote documents still
 * resolve to an empty array.
 */
export function extractFootnotes(doc: unknown): ExtractedFootnote[] {
  const out: ExtractedFootnote[] = [];
  let counter = 0;

  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as { type?: string; attrs?: { content?: unknown }; content?: unknown[] };
    if (n.type === FOOTNOTE_NODE_NAME) {
      counter += 1;
      const raw = n.attrs?.content;
      out.push({
        index: counter,
        content: typeof raw === 'string' ? raw : '',
      });
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) visit(child);
    }
  };

  visit(doc);
  return out;
}
