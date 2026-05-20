/**
 * Breadcrumb block node.
 *
 * Stored as a compact atom because it represents live host context rather
 * than editable prose. The host renderer receives the current note context
 * through `EDITOR_NOTE_CONTEXT_KEY` and paints the actual folder path.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import {
  DEFAULT_BREADCRUMB_BLOCK_ATTRS,
  normalizeBreadcrumbBlockAttrs,
  type BreadcrumbBlockAttrs,
} from './breadcrumbBlockTypes';

function safeParse(raw: string | null): BreadcrumbBlockAttrs {
  if (!raw) return DEFAULT_BREADCRUMB_BLOCK_ATTRS;
  try {
    return normalizeBreadcrumbBlockAttrs(JSON.parse(raw) as Partial<BreadcrumbBlockAttrs>);
  } catch {
    return DEFAULT_BREADCRUMB_BLOCK_ATTRS;
  }
}

export const BreadcrumbBlock = Node.create({
  name: 'breadcrumbBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      showLeaf: {
        default: DEFAULT_BREADCRUMB_BLOCK_ATTRS.showLeaf,
        parseHTML: (el) => safeParse(el.getAttribute('data-breadcrumb-block')).showLeaf,
      },
      schemaVersion: {
        default: DEFAULT_BREADCRUMB_BLOCK_ATTRS.schemaVersion,
        parseHTML: (el) => safeParse(el.getAttribute('data-breadcrumb-block')).schemaVersion,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="breadcrumb-block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const payload = normalizeBreadcrumbBlockAttrs({
      showLeaf: node.attrs.showLeaf,
      schemaVersion: node.attrs.schemaVersion,
    });
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'breadcrumb-block',
        'data-breadcrumb-block': JSON.stringify(payload),
        class: 'continuum-breadcrumb-block',
      }),
    ];
  },
});
