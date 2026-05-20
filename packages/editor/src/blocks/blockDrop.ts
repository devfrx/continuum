/**
 * Geometry helpers for the native block handle.
 *
 * These helpers bridge viewport pointer coordinates to ProseMirror
 * document positions. They intentionally know nothing about Vue state;
 * callers can reuse them for drag/drop, hover affordances or tests.
 */
import type { Editor } from '@tiptap/core';
import type { EditorBlockSnapshot } from './blockActions';
import { getBlockElement, listSiblingBlocks, listTopLevelBlocks } from './blockActions';

/** Width reserved by the gutter handle, kept in sync with `blockHandle.css`. */
const HANDLE_WIDTH = 48;
/** Visual gap between the gutter handle and the editor's left edge. */
const HANDLE_GAP = 6;
/** Extra vertical ownership around first/last blocks, matching block row hover behavior. */
const HOVER_EDGE_SLOP = 10;

export interface BlockToolbarPlacement {
  x: number;
  y: number;
}

export interface BlockDropTarget {
  block: EditorBlockSnapshot;
  position: number;
  edge: 'before' | 'after';
  adjacent: {
    before: EditorBlockSnapshot | null;
    after: EditorBlockSnapshot | null;
  };
  indicatorTop: number;
  indicatorLeft: number;
  indicatorWidth: number;
}

interface BlockRectCandidate {
  block: EditorBlockSnapshot;
  rect: DOMRect;
}

/**
 * Position the toolbar beside a rendered block in viewport coordinates.
 *
 * The horizontal anchor stays in the gutter on the left of the editor;
 * the vertical anchor is the first text line of the block so the toolbar
 * aligns with the cursor regardless of block height (paragraph, callout,
 * table, chart, database all use the same rule).
 */
export function getToolbarPlacement(
  editor: Editor,
  block: EditorBlockSnapshot,
): BlockToolbarPlacement | null {
  const el = getBlockElement(editor, block);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const editorRect = editor.view.dom.getBoundingClientRect();
  const firstLine = firstLineRect(editor, block, rect);
  const lineCenter = firstLine.top + (firstLine.bottom - firstLine.top) / 2;
  const anchorLeft = block.depth > 0 ? rect.left : editorRect.left;
  const x = Math.max(8, anchorLeft - HANDLE_WIDTH - HANDLE_GAP);
  const y = Math.max(8, lineCenter - HANDLE_WIDTH / 4);
  return { x, y };
}

/**
 * Resolve a Notion-like hover row from viewport coordinates.
 *
 * Hover owns the whole visible row of a top-level block: the left gutter,
 * the writing area, the empty horizontal space after short text, and half
 * of the vertical gap to adjacent blocks. This keeps the handle visible
 * when the pointer is in the block's area even if it is not over a child DOM
 * node rendered by ProseMirror or a NodeView.
 */
export function getHoverBlockAtCoords(
  editor: Editor,
  clientX: number,
  clientY: number,
): EditorBlockSnapshot | null {
  const editorRect = editor.view.dom.getBoundingClientRect();
  const scrollHost = editor.view.dom.closest('.content');
  const hostRect = scrollHost instanceof HTMLElement
    ? scrollHost.getBoundingClientRect()
    : editorRect;
  const hoverLeft = Math.min(hostRect.left, editorRect.left - HANDLE_WIDTH - HANDLE_GAP);
  const hoverRight = Math.max(hostRect.right, editorRect.right);
  if (clientX < hoverLeft || clientX > hoverRight) return null;
  if (clientY < hostRect.top || clientY > hostRect.bottom) return null;

  const candidates = blockRectCandidates(editor);
  const containing = candidates
    .filter(({ rect }) => clientY >= rect.top && clientY <= rect.bottom)
    .sort((a, b) => b.block.depth - a.block.depth || a.rect.height - b.rect.height);
  if (containing[0]) return containing[0].block;

  for (let index = 0; index < candidates.length; index += 1) {
    const previous = candidates[index - 1]?.rect ?? null;
    const current = candidates[index]!;
    const next = candidates[index + 1]?.rect ?? null;
    const topGap = previous ? Math.max(0, current.rect.top - previous.bottom) : 0;
    const bottomGap = next ? Math.max(0, next.top - current.rect.bottom) : 0;
    const zoneTop = previous
      ? current.rect.top - topGap / 2
      : current.rect.top - HOVER_EDGE_SLOP;
    const zoneBottom = next
      ? current.rect.bottom + bottomGap / 2
      : current.rect.bottom + HOVER_EDGE_SLOP;
    if (clientY >= zoneTop && clientY <= zoneBottom) return current.block;
  }
  return null;
}

/**
 * Resolve the closest drop target for a pointer coordinate.
 *
 * Returns the nearest top-level block by vertical distance, so the
 * indicator snaps even when the pointer sits in the gap between blocks
 * (or beyond the first/last block) instead of disappearing.
 */
export function getDropTargetAtCoords(
  editor: Editor,
  _clientX: number,
  clientY: number,
): BlockDropTarget | null {
  const blocks = listTopLevelBlocks(editor);
  if (blocks.length === 0) return null;
  const editorRect = editor.view.dom.getBoundingClientRect();
  let bestBlock: EditorBlockSnapshot | null = null;
  let bestRect: DOMRect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDepth = -1;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const el = getBlockElement(editor, block);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const distance = clientY < rect.top
      ? rect.top - clientY
      : clientY > rect.bottom
        ? clientY - rect.bottom
        : 0;
    if (distance < bestDistance || (distance === bestDistance && block.depth > bestDepth)) {
      bestDistance = distance;
      bestBlock = block;
      bestRect = rect;
      bestDepth = block.depth;
    }
  }
  if (!bestBlock || !bestRect) return null;
  const siblings = listSiblingBlocks(editor, bestBlock);
  const siblingIndex = siblings.findIndex((block) => block.from === bestBlock?.from && block.to === bestBlock.to);
  const edge: BlockDropTarget['edge'] =
    clientY < bestRect.top + bestRect.height / 2 ? 'before' : 'after';
  return {
    block: bestBlock,
    edge,
    position: edge === 'before' ? bestBlock.from : bestBlock.to,
    adjacent: edge === 'before'
      ? {
          before: siblingIndex > 0 ? siblings[siblingIndex - 1]! : null,
          after: bestBlock,
        }
      : {
          before: bestBlock,
          after: siblingIndex >= 0 && siblingIndex < siblings.length - 1 ? siblings[siblingIndex + 1]! : null,
        },
    indicatorTop: edge === 'before' ? bestRect.top : bestRect.bottom,
    indicatorLeft: bestBlock.depth > 0 ? bestRect.left : editorRect.left,
    indicatorWidth: bestBlock.depth > 0 ? bestRect.width : editorRect.width,
  };
}

function blockRectCandidates(editor: Editor): BlockRectCandidate[] {
  const candidates: BlockRectCandidate[] = [];
  for (const block of listTopLevelBlocks(editor)) {
    const el = getBlockElement(editor, block);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    candidates.push({ block, rect });
  }
  return candidates;
}

/**
 * Resolve the first-line rect of a block. Falls back to the block rect
 * when the block has no inline content (divider, image, embedded view).
 */
function firstLineRect(
  editor: Editor,
  block: EditorBlockSnapshot,
  fallback: DOMRect,
): { top: number; bottom: number } {
  try {
    const inside = Math.min(block.from + 1, Math.max(block.from, block.to - 1));
    const coords = editor.view.coordsAtPos(inside);
    if (Number.isFinite(coords.top) && coords.bottom > coords.top) {
      return { top: coords.top, bottom: coords.bottom };
    }
  } catch {
    // ignore — non-textual block (image, divider, NodeView without text)
  }
  const lineHeight = Math.min(fallback.height, 28);
  return { top: fallback.top, bottom: fallback.top + lineHeight };
}
