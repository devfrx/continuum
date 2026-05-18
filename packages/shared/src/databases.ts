// ===== Notion-like Database blocks =====
//
// A Database is a server-owned data source that lives independently from
// any single note. Every "row" of a Database is a real {@link Note} (so
// each row keeps its own editable page, lock, tags, links, properties,
// graph membership), tied to the Database by a membership row in
// `database_rows`. The Database itself stores schema (property
// definitions with `scope='database'`), saved Views (table / list / …)
// and metadata (title, icon, description).
//
// In the Tiptap editor a Database is rendered through a `database` node
// whose attributes carry only stable references — `databaseId`, an
// optional `viewId`, and a `schemaVersion` for forward-compat. The node
// view never embeds rows or schema; it asks the server for them on mount.
//
// Multiple `database` blocks can point at the same `databaseId` — that
// is the linked-database pattern: each block shows the shared data
// through a different saved view.

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

/** A saved view on a Database. */
export interface DatabaseView {
  id: UUID;
  databaseId: UUID;
  name: string;
  type: DatabaseViewType;
  /** LexoRank string for stable ordering within the database. */
  position: string;
  /**
   * Optional per-view datasource override. When set (and different
   * from the parent block's bound database), this view resolves its
   * rows and schema against this database instead. `null` falls back
   * to the parent block's `databaseId`.
   */
  dataSourceDatabaseId?: UUID | null;
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
 */
export const DATABASE_BLOCK_SCHEMA_VERSION = 1;

/**
 * Attributes serialized on the Tiptap `database` node. Stable, minimal,
 * and reference-only — every authoritative piece of data (schema, rows,
 * views) lives server-side.
 */
export interface DatabaseBlockAttrs {
  /** Stable block id (UI keying + future analytics). */
  blockId: string;
  /** Target database. `null` means "unbound" (user must create or link). */
  databaseId: UUID | null;
  /**
   * Optional saved view to render. `null` falls back to the database's
   * first view (by position).
   */
  viewId: UUID | null;
  /** Persisted attribute schema version. */
  schemaVersion: number;
}

/** Factory for a fresh, unbound block. */
export function createDatabaseBlockAttrs(blockId: string): DatabaseBlockAttrs {
  return {
    blockId,
    databaseId: null,
    viewId: null,
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
 * Request payload for `POST /api/databases/:databaseId/rows/query`.
 * Combines the row source (the database) with the view configuration
 * the client wants applied. Sending a `viewId` is a shorthand to load
 * the saved config; sending explicit `config` overrides it (used for
 * unsaved tweaks in the toolbar).
 */
export interface DatabaseQueryRequest {
  /** Saved view to load the config from. Optional. */
  viewId?: UUID | null;
  /** Inline config override; merged on top of the saved view if any. */
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

/** Input shape for `POST /api/databases/:id/views`. */
export interface DatabaseViewCreateInput {
  name: string;
  type: DatabaseViewType;
  position?: string;
  config?: Partial<DatabaseViewConfig>;
}

/** Input shape for `PATCH /api/databases/:databaseId/views/:viewId`. */
export interface DatabaseViewUpdateInput {
  name?: string;
  type?: DatabaseViewType;
  position?: string;
  config?: Partial<DatabaseViewConfig>;
  /**
   * Optional per-view datasource override. When set (and different from
   * the parent block's database id), the view queries rows and schema
   * against the override database. Pass `null` to clear the override
   * and fall back to the block's database.
   */
  dataSourceDatabaseId?: UUID | null;
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
export interface DatabaseBundle {
  database: Database;
  views: DatabaseView[];
  schema: PropertyDefinition[];
}
