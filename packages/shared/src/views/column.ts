// ===== Column configuration for Database Views =====
//
// Per-view, per-property visual settings used by the table layout. Other
// layouts (board/gallery/list/...) reuse `visible` / `position` to decide
// which properties to render and in what order.

import { z } from 'zod';

/**
 * One column entry in a view. Stored as an array (not a map) so column
 * order is implicit in `position` and the array preserves insertion order
 * for clients that ignore positions.
 *
 * Invariants:
 *  - `propertyKey` is unique within a view's `columns[]`.
 *  - `position` is a LexoRank-style fractional rank (lexicographically
 *    comparable string). Inserts between two columns assign a key strictly
 *    between the neighbours so no full re-ranking is required.
 *  - `width` is in CSS pixels. `null`/omitted means "auto" (let the layout
 *    decide); negative values are rejected by the schema.
 *  - `frozen` columns stick to the left when the table scrolls horizontally.
 *  - `wrap` toggles word-wrap for long cell content in this column.
 */
export interface ColumnConfig {
  /** Stable property key (slug) on the owning kind. */
  propertyKey: string;
  /** Whether the column is rendered. Hidden columns are still queried. */
  visible: boolean;
  /** Width in CSS pixels. `null` = auto sizing. */
  width: number | null;
  /** LexoRank fractional rank for stable column ordering. */
  position: string;
  /** Pin this column to the left during horizontal scroll. */
  frozen: boolean;
  /** Word-wrap long cell content in this column. */
  wrap: boolean;
}

/** Zod schema mirroring {@link ColumnConfig}. */
export const columnConfigSchema = z.object({
  propertyKey: z.string().min(1),
  visible: z.boolean(),
  width: z.number().int().nonnegative().nullable(),
  position: z.string().min(1),
  frozen: z.boolean(),
  wrap: z.boolean(),
});

/** Inferred type, structurally identical to {@link ColumnConfig}. */
export type ColumnConfigSchema = z.infer<typeof columnConfigSchema>;

/** Zod schema for an ordered list of column configs. */
export const columnConfigsSchema = z.array(columnConfigSchema);
