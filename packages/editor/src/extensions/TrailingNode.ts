/**
 * TrailingNode — ensures the document always ends with an empty paragraph.
 *
 * Without it, blocks like images, code blocks, tables or callouts placed at
 * the end of the document leave no place for the caret: ProseMirror has no
 * trailing text node, so clicks on empty space below the last block can't
 * land anywhere. Inserting a sentinel paragraph fixes this without any UI.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const TrailingNode = Extension.create({
  name: 'trailingNode',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingNode'),
        appendTransaction: (_transactions, _oldState, newState) => {
          const { doc, schema, tr } = newState;
          const paragraphType = schema.nodes.paragraph;
          if (!paragraphType) return null;
          const last = doc.lastChild;
          if (last && last.type.name === 'paragraph') return null;
          return tr.insert(doc.content.size, paragraphType.create());
        },
      }),
    ];
  },
});
