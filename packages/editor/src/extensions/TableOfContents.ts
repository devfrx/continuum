/**
 * Table of contents extension wrapper.
 *
 * `@tiptap/extension-table-of-contents` watches the document for
 * heading nodes and emits a flat array of TOC entries on every change.
 * Each entry carries enough context (level, original DOM node, scroll
 * state) to drive a sidebar list with active-section highlighting.
 *
 * The wrapper here:
 *   1. Forces `getHierarchicalIndexes` so numbering ("1.1", "1.2", "2")
 *      reflects nesting instead of flat ordering — the more useful
 *      default for a knowledge-base UI.
 *   2. Projects the verbose internal `TableOfContentDataItem` type to
 *      a serialisable, host-friendly `TocAnchor` so consumers don't
 *      have to import editor-internal types.
 */
import { TableOfContents, getHierarchicalIndexes } from '@tiptap/extension-table-of-contents';
import type { Extension } from '@tiptap/core';
import type {
  TableOfContentData,
  TableOfContentDataItem,
  TableOfContentsOptions,
} from '@tiptap/extension-table-of-contents';

/**
 * Host-facing projection of a single TOC entry. Strips DOM / editor
 * references so the value can be passed across component boundaries
 * (props, emits) and snapshotted without Vue reactivity surprises.
 */
export interface TocAnchor {
  /** Stable slug-derived id (matches the heading's `id` DOM attribute). */
  id: string;
  /** Display label — the heading's text content. */
  textContent: string;
  /** Display level after `getHierarchicalIndexes` normalisation (1-based). */
  level: number;
  /** Source heading level as it appears in the document. */
  originalLevel: number;
  /** Hierarchical index within its level (1-based). */
  itemIndex: number;
  /** Document position of the heading node — used by `scrollToAnchor`. */
  pos: number;
  /** True when the viewport currently shows this heading. */
  isActive: boolean;
  /** True when the user has scrolled past this heading. */
  isScrolledOver: boolean;
}

export function projectTocData(data: TableOfContentData): TocAnchor[] {
  return data.map((item: TableOfContentDataItem) => ({
    id: item.id,
    textContent: item.textContent,
    level: item.level,
    originalLevel: item.originalLevel,
    itemIndex: item.itemIndex,
    pos: item.pos,
    isActive: item.isActive,
    isScrolledOver: item.isScrolledOver,
  }));
}

interface BuildOptions {
  /**
   * Notified on every TOC update. Receives the projected anchor list
   * (already debounced internally by the extension on heading changes).
   */
  onUpdate: (anchors: TocAnchor[]) => void;
  /** Optional overrides forwarded verbatim to the underlying extension. */
  overrides?: Partial<Omit<TableOfContentsOptions, 'onUpdate' | 'getIndex'>>;
}

export function buildTableOfContents(
  opts: BuildOptions,
): Extension<TableOfContentsOptions, unknown> {
  return TableOfContents.configure({
    getIndex: getHierarchicalIndexes,
    ...opts.overrides,
    onUpdate: (data) => opts.onUpdate(projectTocData(data)),
  });
}
