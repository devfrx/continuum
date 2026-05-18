// ===== Notion-like Database blocks =====
//
// Conceptual hierarchy:
//
//   Database (a.k.a. "datasource") — server-owned, globally-listed,
//   independent of any note. Owns its schema (property definitions with
//   `scope='database'`) and row memberships (`database_rows`). Lifecycle
//   is managed both from the global `/databases` manager surface and
//   inline from any database block (via "create new datasource").
//
//   ↓
//
//   Database block — a `database` Tiptap node embedded in a note. Owns
//   ONLY a stable `blockId`, an `activeViewId` and a `schemaVersion`.
//   The block is not bound to a datasource directly: each of its views
//   carries its own `dataSourceDatabaseId`. A brand-new block has zero
//   views and shows an unbound picker prompting the user to create or
//   link a datasource (which seeds the first view).
//
//   ↓
//
//   BlockView — a saved layout (table / board / gallery / …) that
//   belongs to a specific block (`blockId`) and points at a specific
//   datasource (`dataSourceDatabaseId`, required). A block can have
//   multiple views, each pointing at the same or different datasources.
//
// Each row of a Database is a real {@link Note} (so it keeps its own
// editable page, lock, tags, links, properties, graph membership), tied
// to the Database by a membership row in `database_rows`.

import type { UUID } from './index.js';
import type { FilterNode } from './query/filters.js';
import type { FieldRef } from './query/fields.js';
import type { PropertyDefinition } from './properties.js';

// ─────────────────────────── Core resources ────────────────────────────

/** A Database is the persistent data source backing one or more blocks. */
export interface Database {
  id: UUID;
  /** Display title. May be empty until the user names it. */
  title: string;
  /** Optional human description shown in the toolbar. */
  description: string | null;
  /** Optional icon name resolved by the host icon catalog. */
  icon: string | null;
  /**
   * When `true` every mutation (schema, view, row, cell) is rejected
   * server-side with HTTP 423. The frontend renders a read-only state.
   */
  locked: boolean;
  /** When `true` the database is hidden from default listings. */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Supported view types.
 *
 * The first five (`table`, `list`, `board`, `gallery`, `calendar`) are
 * fully implemented renderers. The remaining types (`timeline`, `chart`,
 * `dashboard`, `feed`, `map`, `form`) are reserved entries — they are
 * accepted by the server, persistable in the DB, and surfaced by the
 * web view picker, but the frontend renders them through a shared
 * placeholder until the dedicated renderer ships. Adding a renderer
 * later is a single-file addition in
 * `apps/web/src/components/databases/views/registry.ts`.
 *
 * Order matters: the picker UI mirrors this declaration order.
 */
export type DatabaseViewType =
  | 'table'
  | 'board'
  | 'gallery'
  | 'list'
  | 'calendar'
  | 'timeline'
  | 'chart'
  | 'dashboard'
  | 'feed'
  | 'map'
  | 'form';

/** Canonical list mirroring {@link DatabaseViewType}. */
export const DATABASE_VIEW_TYPES: readonly DatabaseViewType[] = [
  'table',
  'board',
  'gallery',
  'list',
  'calendar',
  'timeline',
  'chart',
  'dashboard',
  'feed',
  'map',
  'form',
] as const;

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** One sort rule applied to a view. */
export interface SortRule {
  /** Stable client id for keyed rendering. */
  id: string;
  field: FieldRef;
  direction: SortDirection;
}

/** One grouping rule (board column key, calendar date field, …). */
export interface GroupRule {
  field: FieldRef;
}

/**
 * Configuration payload persisted on each view. The wire shape is
 * intentionally open-ended for view-specific knobs (`layout`) so the
 * server schema does not need to grow new columns per view type.
 */
export interface DatabaseViewConfig {
  /** Filter tree applied to the row set. Empty group = no filter. */
  filter: FilterNode;
  /** Ordered list of sort rules; first rule wins on ties. */
  sort: SortRule[];
  /** Optional grouping (Board column, Calendar date, …). */
  group?: GroupRule | null;
  /**
   * Ordered list of property keys visible in the view. `null` means
   * "show every property" so newly-created properties become visible
   * automatically; an explicit list pins both order and visibility.
   */
  visibleProperties: string[] | null;
  /**
   * Hidden property keys — kept alongside `visibleProperties` so the
   * view can preserve "explicitly hidden" intent even when
   * `visibleProperties` is `null`.
   */
  hiddenProperties: string[];
  /**
   * View-specific layout knobs. Shape depends on the view `type` and is
   * validated by view-specific code; kept as `unknown` here so the
   * shared package stays decoupled from any single view's renderer.
   */
  layout?: Record<string, unknown> | null;
}

/** Canonical empty view config used to seed brand-new views. */
export const EMPTY_DATABASE_VIEW_CONFIG: DatabaseViewConfig = {
  filter: { type: 'group', id: 'root', combinator: 'and', children: [] },
  sort: [],
  group: null,
  visibleProperties: null,
  hiddenProperties: [],
  layout: null,
};

/**
 * A saved view that belongs to one database block and points at one
 * datasource. Every block view is block-scoped (lives or dies with its
 * block) and references its datasource explicitly — there is no notion
 * of a "block's default database" any more.
 */
export interface DatabaseView {
  id: UUID;
  /** Block this view belongs to (Tiptap node attribute `blockId`). */
  blockId: string;
  /**
   * Datasource queried by this view. Required: a view without a
   * datasource cannot render anything. ON DELETE CASCADE on the
   * underlying FK means deleting the datasource also removes this view.
   */
  dataSourceDatabaseId: UUID;
  name: string;
  type: DatabaseViewType;
  /** LexoRank string for stable ordering within the block. */
  position: string;
  config: DatabaseViewConfig;
  createdAt: string;
  updatedAt: string;
}

/** Membership row tying a Note to a Database. */
export interface DatabaseRow {
  id: UUID;
  databaseId: UUID;
  noteId: UUID;
  /** LexoRank string for stable manual ordering. */
  position: string;
  createdAt: string;
  updatedAt: string;
}

// ────────────────────────── Block attributes ───────────────────────────

/**
 * Current persisted schema version of `DatabaseBlockAttrs`. Bumped only
 * when the on-disk attribute shape changes; the editor's
 * `safeParse` fall back tolerates older payloads without crashing.
 *
 * v2: dropped the inline `databaseId` / `viewId` references. The block
 * no longer owns a datasource — its views do. The active view selection
 * is preserved as a stable id; the source/type/config live server-side.
 */
export const DATABASE_BLOCK_SCHEMA_VERSION = 2;

/**
 * Attributes serialized on the Tiptap `database` node. Stable, minimal,
 * and reference-only — every authoritative piece of data (views,
 * schema, rows, view config) lives server-side.
 */
export interface DatabaseBlockAttrs {
  /** Stable block id (UI keying, foreign key for `database_block_views`). */
  blockId: string;
  /** Currently focused view; `null` until at least one view exists. */
  activeViewId: UUID | null;
  /** Persisted attribute schema version. */
  schemaVersion: number;
}

/** Factory for a fresh, empty block (zero views, no active selection). */
export function createDatabaseBlockAttrs(blockId: string): DatabaseBlockAttrs {
  return {
    blockId,
    activeViewId: null,
    schemaVersion: DATABASE_BLOCK_SCHEMA_VERSION,
  };
}

// ────────────────────────── Query / response ───────────────────────────

/** Pagination cursor for `DatabaseQueryRequest`. */
export interface DatabasePagination {
  /** Zero-based row offset. */
  offset: number;
  /** Maximum rows returned per page (server enforces upper bound). */
  limit: number;
}

/**
 * Request payload for `POST /api/databases/:databaseId/query`.
 *
 * Pure datasource query: the server applies the inline `config` (filter,
 * sort, …) against the datasource's row set and returns a page of
 * snapshots. View identity is *not* used here — the client (which knows
 * the active block view) is the one that supplies the effective config.
 */
export interface DatabaseQueryRequest {
  /** Inline config used by the server to sort/filter the result set. */
  config?: Partial<DatabaseViewConfig>;
  /** Pagination window. */
  pagination?: DatabasePagination;
}

/**
 * A single row in the query response — full snapshot ready to render.
 * Carries the underlying note so the table renderer never needs to
 * round-trip for title / lock / tags / timestamps.
 */
export interface DatabaseRowSnapshot {
  rowId: UUID;
  noteId: UUID;
  /** Manual / sort position used by the renderer for stable ordering. */
  position: string;
  /** Underlying note (title, kind, locked, tags, timestamps). */
  note: {
    id: UUID;
    title: string;
    kind: string;
    tags: string[];
    locked: boolean;
    folderId: UUID | null;
    /** Optional cover image — propagated so Gallery/Card layouts can render it. */
    coverImage: string | null;
    createdAt: string;
    updatedAt: string;
  };
  /**
   * Materialised properties for this row, keyed by definition id. The
   * server already evaluated formulas / rollups / unique ids; the client
   * renders them through the same editors as the inline property panel.
   */
  properties: import('./properties.js').NoteProperty[];
}

/** Response payload for the query endpoint. */
export interface DatabaseQueryResponse {
  /** Total rows after filtering (before pagination). */
  total: number;
  /** Rows for the requested page, in the configured order. */
  rows: DatabaseRowSnapshot[];
}

// ─────────────────────── Create / update payloads ──────────────────────

/** Input shape for `POST /api/databases`. */
export interface DatabaseCreateInput {
  title?: string;
  description?: string | null;
  icon?: string | null;
}

/** Input shape for `PATCH /api/databases/:id`. */
export interface DatabaseUpdateInput {
  title?: string;
  description?: string | null;
  icon?: string | null;
  locked?: boolean;
  archived?: boolean;
}

/** Input shape for `POST /api/block-views`. */
export interface DatabaseViewCreateInput {
  /** Owning block (Tiptap node `blockId`). */
  blockId: string;
  /** Datasource the new view queries against. Required. */
  dataSourceDatabaseId: UUID;
  name: string;
  type: DatabaseViewType;
  position?: string;
  config?: Partial<DatabaseViewConfig>;
}

/** Input shape for `PATCH /api/block-views/:viewId`. */
export interface DatabaseViewUpdateInput {
  name?: string;
  type?: DatabaseViewType;
  position?: string;
  config?: Partial<DatabaseViewConfig>;
  /**
   * Swap the view's datasource. Required to remain set (no `null`
   * value): a view always points at exactly one datasource. Use
   * DELETE to remove the view entirely.
   */
  dataSourceDatabaseId?: UUID;
}

/** Input shape for `POST /api/databases/:id/rows`. */
export interface DatabaseRowCreateInput {
  /**
   * When set, the database links to an existing note instead of creating
   * a new one. Useful for the "Link existing note" command.
   */
  noteId?: UUID;
  /** Initial title for newly-created notes. Ignored when `noteId` is set. */
  title?: string;
  /** Optional position override (LexoRank). Otherwise appended to the end. */
  position?: string;
}

/**
 * Bundle returned by `GET /api/databases/:id`. The hot path for the
 * editor: one round-trip gives the toolbar everything it needs to
 * render the database without follow-up fetches for views and schema.
 */
/**
 * Bundle returned by `GET /api/databases/:id`. The hot path for the
 * datasource manager and for any block view loading its datasource:
 * one round-trip gives both the database metadata and its property
 * schema. Block-scoped views are NOT part of this bundle — they belong
 * to blocks, not to datasources, and are fetched via the
 * `/api/block-views` namespace keyed by `blockId`.
 */
export interface DatabaseBundle {
  database: Database;
  schema: PropertyDefinition[];
}
