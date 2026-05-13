/**
 * WikilinkDecoration
 * ────────────────────────────────────────────────────────────────────
 * Renders Obsidian-style `[[target]]` / `[[target|alias]]` syntax as
 * Notion-like inline page chips WITHOUT mutating the document.
 *
 * Implementation strategy
 * -----------------------
 * We attach a ProseMirror plugin that maintains a `DecorationSet`
 * derived from a regex scan of every text node. Three inline
 * decorations are emitted per match:
 *
 *   • opening `[[`    → class `cn-wikilink__edge` (de-emphasised)
 *   • inner segment   → class `cn-wikilink__body` (pill / clickable)
 *   • closing `]]`    → class `cn-wikilink__edge`
 *
 * The body decoration carries `data-wl-target` and (optionally)
 * `data-wl-alias` so a host-supplied click handler can resolve the
 * link against its own data source (titles → ids) and navigate.
 *
 * Because decorations live on the view layer the underlying text
 * round-trips untouched through HTML / JSON / backend backlink
 * extraction, which keeps the existing wikilink contract intact.
 *
 * The extension also exposes a `handleClickOn` editor prop that
 * intercepts clicks on `.cn-wikilink__body`, calls the supplied
 * `onNavigate` callback with the resolved target/alias, and prevents
 * the click from placing the caret inside the decoration.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface WikilinkClick {
  target: string;
  alias: string | null;
}

export interface WikilinkDecorationOptions {
  /** Invoked when the user clicks the chip portion of a wikilink. */
  onNavigate?: (link: WikilinkClick) => void;
}

const WIKILINK_REGEX = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    WIKILINK_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKILINK_REGEX.exec(text)) !== null) {
      const matchStart = pos + match.index;
      const matchEnd = matchStart + match[0].length;
      const innerStart = matchStart + 2;
      const innerEnd = matchEnd - 2;
      const target = match[1].trim();
      const alias = match[2]?.trim() ?? null;
      decorations.push(
        Decoration.inline(matchStart, innerStart, { class: 'cn-wikilink__edge' }),
        Decoration.inline(innerStart, innerEnd, {
          class: 'cn-wikilink__body',
          'data-wl-target': target,
          ...(alias ? { 'data-wl-alias': alias } : {}),
        }),
        Decoration.inline(innerEnd, matchEnd, { class: 'cn-wikilink__edge' }),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

export const WikilinkDecorationPluginKey = new PluginKey('wikilinkDecoration');

export const WikilinkDecoration = Extension.create<WikilinkDecorationOptions>({
  name: 'wikilinkDecoration',

  addOptions() {
    return { onNavigate: undefined };
  },

  addProseMirrorPlugins() {
    const onNavigate = this.options.onNavigate;
    return [
      new Plugin({
        key: WikilinkDecorationPluginKey,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          /**
           * Intercept clicks on the chip portion. We read the data attrs
           * from the DOM target rather than re-deriving from the doc so
           * an aliased link (`[[Target|Alias]]`) keeps both pieces of
           * information available to the host.
           */
          handleClickOn(_view, _pos, _node, _nodePos, event) {
            if (!onNavigate) return false;
            const el = (event.target as HTMLElement | null)?.closest?.(
              '.cn-wikilink__body',
            ) as HTMLElement | null;
            if (!el) return false;
            const target = el.getAttribute('data-wl-target');
            if (!target) return false;
            event.preventDefault();
            onNavigate({ target, alias: el.getAttribute('data-wl-alias') });
            return true;
          },
        },
      }),
    ];
  },
});
