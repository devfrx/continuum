/**
 * Media block node for video, audio and downloadable files.
 *
 * All variants share one schema so future media types can be added without
 * multiplying identical upload/link logic. The `kind` attr selects the host
 * renderer surface while the rest of the attrs describe the selected source.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import {
  normalizeMediaBlockAttrs,
  type MediaBlockAttrs,
} from './mediaBlockTypes';

function safeParse(raw: string | null): MediaBlockAttrs {
  if (!raw) return normalizeMediaBlockAttrs(null);
  try {
    return normalizeMediaBlockAttrs(JSON.parse(raw) as Partial<MediaBlockAttrs>);
  } catch {
    return normalizeMediaBlockAttrs(null);
  }
}

export const MediaBlock = Node.create({
  name: 'mediaBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: { default: 'file', parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).kind },
      source: { default: null, parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).source },
      url: { default: null, parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).url },
      name: { default: null, parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).name },
      mime: { default: null, parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).mime },
      size: { default: null, parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).size },
      uploadId: { default: null, parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).uploadId },
      caption: { default: '', parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).caption },
      schemaVersion: {
        default: 1,
        parseHTML: (el) => safeParse(el.getAttribute('data-media-block')).schemaVersion,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="media-block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const payload = normalizeMediaBlockAttrs({
      kind: node.attrs.kind,
      source: node.attrs.source,
      url: node.attrs.url,
      name: node.attrs.name,
      mime: node.attrs.mime,
      size: node.attrs.size,
      uploadId: node.attrs.uploadId,
      caption: node.attrs.caption,
      schemaVersion: node.attrs.schemaVersion,
    });
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'media-block',
        'data-media-block': JSON.stringify(payload),
        class: `continuum-media-block continuum-media-block--${payload.kind}`,
      }),
    ];
  },
});
