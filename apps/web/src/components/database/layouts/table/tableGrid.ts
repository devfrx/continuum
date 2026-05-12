/**
 * Layout constants and the `grid-template-columns` builder for the
 * database table. Kept apart from `TableLayout.vue` so the orchestrator
 * stays under the per-file budget and so cell components can reference
 * the same constants without coupling to the parent.
 */
import type { RowHeight } from '@continuum/shared';
import type { ResolvedColumn } from './useTableColumns';

/** Pixel height for each row-height preset. */
export const ROW_HEIGHT_PX: Record<RowHeight, number> = {
  short: 32,
  medium: 40,
  tall: 56,
};

/** Header row height in CSS pixels. */
export const HEADER_HEIGHT_PX = 36;

/** Width of the leading drag-handle column. */
export const HANDLE_COL_PX = 28;

/** Width of the (frozen) title column. */
export const TITLE_COL_PX = 240;

/** Width of the trailing "+ add property" column. */
export const ADD_COL_PX = 36;

/** Lower bound for any property column width. */
export const MIN_COL_PX = 64;

/** Upper bound for any property column width. */
export const MAX_COL_PX = 1200;

/** Default property column width when a `ColumnConfig.width` is null. */
export const DEFAULT_COL_PX = 180;

/** Resolve a column's effective width with clamping and default fallback. */
export function effectiveWidth(col: ResolvedColumn): number {
  const raw = col.column.width ?? DEFAULT_COL_PX;
  if (raw < MIN_COL_PX) return MIN_COL_PX;
  if (raw > MAX_COL_PX) return MAX_COL_PX;
  return raw;
}

/** Compose a CSS `grid-template-columns` value for the table grid. */
export function buildGridTemplate(columns: readonly ResolvedColumn[]): string {
  const propCols = columns.map((c) => `${effectiveWidth(c)}px`).join(' ');
  return `${HANDLE_COL_PX}px ${TITLE_COL_PX}px ${propCols} ${ADD_COL_PX}px`;
}

/**
 * Compute `propertyKey -> left-px` for every frozen column.
 *
 * The offset is measured from the scroll container's left edge and
 * already accounts for the two pre-frozen sentinels (handle + title
 * columns), which always stick to the left and have fixed widths. The
 * map only contains keys whose `column.frozen === true` so callers can
 * cheaply check `frozenOffsets.has(key)` to decide whether to apply
 * sticky styling at all.
 */
export function computeFrozenOffsets(
  columns: readonly ResolvedColumn[],
): Map<string, number> {
  const offsets = new Map<string, number>();
  let acc = HANDLE_COL_PX + TITLE_COL_PX;
  for (const col of columns) {
    if (!col.column.frozen) continue;
    offsets.set(col.column.propertyKey, acc);
    acc += effectiveWidth(col);
  }
  return offsets;
}
