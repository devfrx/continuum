// ===== Database View — top-level configuration & wire shape =====
//
// A `DatabaseView` is the persisted representation of a saved view over a
// kind. The portion stored inside the JSONB column is `DatabaseViewConfig`;
// the surrounding identity / timestamp fields belong to the row.

import { z } from 'zod';
import type { UUID } from '../index.js';
import { columnConfigSchema, type ColumnConfig } from './column.js';
import { sortRuleSchema, type SortRule } from './sort.js';
import { filterTreeSchema, emptyFilterTree, type FilterTree } from './filter.js';
import { groupConfigSchema, type GroupConfig } from './group.js';
import { calcMapSchema, type CalcFn } from './calculation.js';
import { layoutConfigSchema, defaultTableLayout, type LayoutConfig } from './layout.js';

/**
 * Map of property-key → footer calc function for that column. Properties
 * absent from the map render with no calc (UI shows "Calculate" button).
 */
export type CalcMap = Record<string, CalcFn>;

/**
 * The portion of a {@link DatabaseView} persisted inside the row's JSONB
 * `config` column. Keeping it disjoint from the column-tracked fields
 * (`id` / `kindId` / `name` / `isDefault` / `locked` / `position` /
 * timestamps) means there is no duplicated state and no merge/overlay
 * step on read — a row's wire shape is the union of its columns and
 * `config`.
 */
export interface DatabaseViewConfig {
  layout: LayoutConfig;
  columns: ColumnConfig[];
  sort: SortRule[];
  filter: FilterTree;
  /** When `null`, rows are flat (no grouping). */
  group: GroupConfig | null;
  /** Per-column footer calculations. */
  calculation: CalcMap;
  /** Optional free-text search filter applied across visible columns. */
  search?: string | null;
}

/**
 * A persisted view row — the union of the row's columns and its JSONB
 * config blob. `id` is a UUID; `kindId` is the FK to `kinds.id` (which is
 * `text` server-side, hence `string` here). Timestamps are ISO 8601
 * strings so the wire shape stays JSON-friendly.
 */
export interface DatabaseView extends DatabaseViewConfig {
  id: UUID;
  /** FK → `kinds.id` (text). */
  kindId: string;
  /** Display name shown in the view tabs. */
  name: string;
  /** Whether this view is the kind's default (one per kind). */
  isDefault: boolean;
  /** Locked views reject mutation attempts from non-owner clients. */
  locked: boolean;
  /** LexoRank position used to order tabs in the view-bar. */
  position: string;
  createdAt: string;
  updatedAt: string;
}

// ───────── Schemas ─────────

/** Zod schema mirroring {@link DatabaseViewConfig}. */
export const databaseViewConfigSchema = z.object({
  layout: layoutConfigSchema,
  columns: z.array(columnConfigSchema),
  sort: z.array(sortRuleSchema),
  filter: filterTreeSchema,
  group: groupConfigSchema.nullable(),
  calculation: calcMapSchema,
  search: z.string().nullish(),
});

/** Zod schema for the full {@link DatabaseView} row. */
export const databaseViewSchema = databaseViewConfigSchema.extend({
  id: z.string().uuid(),
  kindId: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean(),
  locked: z.boolean(),
  position: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ───────── Factory ─────────

/**
 * Build a sensible empty view config for a freshly-created kind. The
 * resulting view:
 *  - uses the table layout with medium row height,
 *  - has no filter / sort / group / search,
 *  - leaves `columns` empty (the caller fills them once it knows the
 *    kind's properties — keeping this layer pure of property-list state),
 *  - assigns no calculations.
 *
 * `_kindId` is currently unused but kept in the signature so callers can
 * ergonomically pass the id alongside (and so future versions may seed
 * kind-aware defaults without an API break).
 */
export function createDefaultViewConfig(_kindId: string): DatabaseViewConfig {
  return {
    layout: defaultTableLayout(),
    columns: [],
    sort: [],
    filter: emptyFilterTree(),
    group: null,
    calculation: {},
    search: null,
  };
}
