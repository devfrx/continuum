/**
 * Folder-tree service.
 *
 * Pure functions over an in-memory `Map<id, FolderRow>` that implement the
 * tree-shaped logic for the folders feature:
 *
 *   - {@link buildTree}              forest of `FolderNode` rooted at top-level
 *   - {@link effectiveFor}           Modality B inheritance walk-up
 *   - {@link descendantIds}          subtree id collection (for search scope)
 *   - {@link ancestorIds}            path from a folder up to the root
 *   - {@link wouldCreateCycle}       move validation (parent cannot be self/descendant)
 *   - {@link rankBetween}            LexoRank-style fractional rank generator
 *
 * Routes load all folders once per request (the table is small — folders are
 * curated by hand, not generated) and pass the resulting `Map` to these
 * helpers. Keeping the logic pure makes it trivial to unit-test.
 */

import type { FolderRow } from '../db/schema.js';
import type { FolderNode, FolderEffective } from '@continuum/shared';

/** Project-wide fallback when no ancestor defines a value. */
export const ROOT_FALLBACK: FolderEffective = {
  defaultKind: 'note',
  icon: 'folder',
  color: '#8C7B6A',
};

/** Convert a DB row to the shared `Folder` shape (ISO date strings). */
function toFolder(row: FolderRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    slug: row.slug,
    position: row.position,
    defaultKind: row.defaultKind,
    icon: row.icon,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Build a forest of `FolderNode` from a flat list. Children are sorted by
 * `position` (LexoRank) then by `name` as a stable tiebreaker.
 *
 * @param rows      All folder rows from the DB.
 * @param noteCounts Map `folderId → number of notes directly inside`.
 *                   Notes at the root (folderId = null) are not counted here.
 */
export function buildTree(
  rows: FolderRow[],
  noteCounts: Map<string, number> = new Map(),
): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      ...toFolder(row),
      children: [],
      noteCount: noteCounts.get(row.id) ?? 0,
    });
  }
  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortFn = (a: FolderNode, b: FolderNode) =>
    a.position.localeCompare(b.position) || a.name.localeCompare(b.name);
  const sortRec = (n: FolderNode) => {
    n.children.sort(sortFn);
    n.children.forEach(sortRec);
  };
  roots.sort(sortFn);
  roots.forEach(sortRec);
  return roots;
}

/**
 * Resolve the effective inherited values for a folder by walking up its
 * ancestor chain until each field finds a non-null value, falling back to
 * {@link ROOT_FALLBACK} otherwise.
 */
export function effectiveFor(
  folderId: string | null,
  byId: Map<string, FolderRow>,
): FolderEffective {
  let kind: string | null = null;
  let icon: string | null = null;
  let color: string | null = null;

  let cursor = folderId ? byId.get(folderId) : undefined;
  // Cycle guard: stop after a generous depth so a corrupt DB cannot hang us.
  let depth = 0;
  while (cursor && depth < 64) {
    if (kind === null && cursor.defaultKind) kind = cursor.defaultKind;
    if (icon === null && cursor.icon) icon = cursor.icon;
    if (color === null && cursor.color) color = cursor.color;
    if (kind !== null && icon !== null && color !== null) break;
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    depth += 1;
  }
  return {
    defaultKind: kind ?? ROOT_FALLBACK.defaultKind,
    icon: icon ?? ROOT_FALLBACK.icon,
    color: color ?? ROOT_FALLBACK.color,
  };
}

/** All descendants of `folderId` (inclusive). Used to scope recursive search. */
export function descendantIds(
  folderId: string,
  rows: FolderRow[],
): string[] {
  const childrenOf = new Map<string | null, string[]>();
  for (const r of rows) {
    const arr = childrenOf.get(r.parentId) ?? [];
    arr.push(r.id);
    childrenOf.set(r.parentId, arr);
  }
  const out: string[] = [folderId];
  const stack = [folderId];
  while (stack.length) {
    const current = stack.pop()!;
    const kids = childrenOf.get(current) ?? [];
    for (const k of kids) {
      out.push(k);
      stack.push(k);
    }
  }
  return out;
}

/** Path from `folderId` up to (and including) the root. Order: leaf → root. */
export function ancestorIds(
  folderId: string,
  byId: Map<string, FolderRow>,
): string[] {
  const out: string[] = [];
  let cursor = byId.get(folderId);
  let depth = 0;
  while (cursor && depth < 64) {
    out.push(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    depth += 1;
  }
  return out;
}

/**
 * Returns true when moving `folderId` under `newParentId` would create a
 * cycle (i.e. `newParentId` is `folderId` itself or one of its descendants).
 */
export function wouldCreateCycle(
  folderId: string,
  newParentId: string | null,
  rows: FolderRow[],
): boolean {
  if (!newParentId) return false;
  if (newParentId === folderId) return true;
  const subtree = new Set(descendantIds(folderId, rows));
  return subtree.has(newParentId);
}

/**
 * Generate a LexoRank-style fractional key strictly between `before` and
 * `after`. Either bound may be `null` (= open range).
 *
 * The algorithm uses base-36 lowercase digits and finds the lexicographic
 * midpoint. For typical sibling counts (< 1000) it produces 1–4 character
 * keys; pathological insert patterns extend the key length but never
 * require renumbering existing siblings.
 */
export function rankBetween(before: string | null, after: string | null): string {
  const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
  const MIN = '0';
  const MAX = 'z';
  const lo = before ?? MIN;
  const hi = after ?? MAX + MAX;
  // Walk character by character looking for the first position where we can
  // place a digit strictly between lo[i] and hi[i].
  let i = 0;
  let prefix = '';
  while (true) {
    const a = lo[i] ?? MIN;
    const b = hi[i] ?? MAX;
    const ai = ALPHABET.indexOf(a);
    const bi = ALPHABET.indexOf(b);
    if (bi - ai > 1) {
      const mid = ALPHABET[Math.floor((ai + bi) / 2)];
      return prefix + mid;
    }
    // Tight at this position — keep `a` and look one digit deeper.
    prefix += a;
    i += 1;
    if (i > 32) {
      // Safety guard. Should never happen in practice.
      return prefix + 'm';
    }
  }
}
