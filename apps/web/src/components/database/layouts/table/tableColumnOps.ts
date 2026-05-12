/**
 * Pure mutation helpers for `ColumnConfig[]` arrays.
 *
 * Kept side-effect-free so they can be unit-tested in isolation and so
 * the table layout has a single source of truth for "what does X
 * interaction do to the columns array".
 *
 * The table layout always works on a *fully materialised* array (one
 * entry per property definition, including hidden ones). Materialisation
 * happens in `useTableColumns.ts`; these helpers receive that array,
 * apply a mutation, and return a new array — they never read or write
 * external state.
 */
import type { ColumnConfig } from '@continuum/shared';

/** Re-stamp `position` so the array order matches the LexoRank ordering. */
function withFreshPositions(list: ColumnConfig[]): ColumnConfig[] {
  return list.map((c, i) => ({ ...c, position: `a${String(i).padStart(4, '0')}` }));
}

/** Apply a partial patch to one column, identified by `propertyKey`. */
export function replaceColumn(
  columns: readonly ColumnConfig[],
  propertyKey: string,
  patch: Partial<ColumnConfig>,
): ColumnConfig[] {
  return columns.map((c) => (c.propertyKey === propertyKey ? { ...c, ...patch } : { ...c }));
}

/** Toggle visibility on one column. */
export function setColumnVisibility(
  columns: readonly ColumnConfig[],
  propertyKey: string,
  visible: boolean,
): ColumnConfig[] {
  return replaceColumn(columns, propertyKey, { visible });
}

/** Toggle the `wrap` flag on one column. */
export function toggleColumnWrap(
  columns: readonly ColumnConfig[],
  propertyKey: string,
): ColumnConfig[] {
  const target = columns.find((c) => c.propertyKey === propertyKey);
  if (!target) return [...columns];
  return replaceColumn(columns, propertyKey, { wrap: !target.wrap });
}

/**
 * Move `propertyKey` to a new index defined relative to `targetKey`.
 *
 * `position === 'before'` inserts the source immediately before the
 * target; `'after'` inserts it immediately after. The two title-adjacent
 * sentinels are not represented in the columns array, so this helper
 * never has to skip them.
 */
export function reorderColumns(
  columns: readonly ColumnConfig[],
  propertyKey: string,
  targetKey: string,
  position: 'before' | 'after',
): ColumnConfig[] {
  if (propertyKey === targetKey) return [...columns];
  const list = columns.map((c) => ({ ...c }));
  const fromIdx = list.findIndex((c) => c.propertyKey === propertyKey);
  if (fromIdx < 0) return list;
  const [moved] = list.splice(fromIdx, 1);
  if (!moved) return list;
  let toIdx = list.findIndex((c) => c.propertyKey === targetKey);
  if (toIdx < 0) {
    list.splice(fromIdx, 0, moved);
    return list;
  }
  if (position === 'after') toIdx += 1;
  list.splice(toIdx, 0, moved);
  return withFreshPositions(list);
}

/**
 * Freeze every column from index 0 up to and including `propertyKey`,
 * and unfreeze everything to its right. Applied to the materialised
 * (visible + hidden) array so toggling one frozen column does not
 * silently drop the freeze state of hidden ones.
 */
export function freezeUpTo(
  columns: readonly ColumnConfig[],
  propertyKey: string,
): ColumnConfig[] {
  const idx = columns.findIndex((c) => c.propertyKey === propertyKey);
  if (idx < 0) return columns.map((c) => ({ ...c }));
  return columns.map((c, i) => ({ ...c, frozen: i <= idx }));
}

/**
 * Unfreeze `propertyKey` and every column to its right; columns to the
 * left keep their existing `frozen` state.
 */
export function unfreezeFrom(
  columns: readonly ColumnConfig[],
  propertyKey: string,
): ColumnConfig[] {
  const idx = columns.findIndex((c) => c.propertyKey === propertyKey);
  if (idx < 0) return columns.map((c) => ({ ...c }));
  return columns.map((c, i) => (i >= idx ? { ...c, frozen: false } : { ...c }));
}
