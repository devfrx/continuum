/**
 * views/types.ts — shared contract for every database view renderer.
 *
 * The contract is intentionally minimal: every renderer receives the
 * full bundle (`database`, `schema`, `rows`, `activeView`) plus the
 * `editable` flag and an optional `draftRequest` counter that the
 * toolbar's primary action increments. Renderers that don't support
 * draft creation simply ignore the counter.
 *
 * Emits mirror the legacy `DatabaseTableView` surface so wiring stays
 * uniform across renderers and the parent (`DatabaseBody`) doesn't need
 * to branch per type.
 *
 * View-specific configuration (e.g. which property a Board groups by)
 * lives inside `activeView.config.layout` as an open `Record<string,
 * unknown>` and is mutated through the `view-config-changed` event.
 */
import type {
  Database,
  DatabaseRowSnapshot,
  DatabaseView,
  DatabaseViewConfig,
  DatabaseViewType,
  PropertyDefinition,
} from '@continuum/shared';
import type { Component } from 'vue';
import type { AppIconName } from '@/assets/icons';

/** Props every view renderer accepts. */
export interface DatabaseViewSurfaceProps {
  database: Database;
  schema: PropertyDefinition[];
  rows: DatabaseRowSnapshot[];
  activeView: DatabaseView;
  editable: boolean;
  /**
   * Counter incremented by the toolbar's primary action. Renderers that
   * support inline row creation (currently only `table`) watch this and
   * open their draft state when it changes.
   */
  draftRequest?: number;
}

/** Emits every view renderer is allowed to raise. */
export interface DatabaseViewSurfaceEmits {
  /** A property definition was added / renamed / removed / reordered. */
  (event: 'schema-changed'): void;
  /** Remove the membership row (optionally deletes the underlying note). */
  (event: 'remove-row', rowId: string): void;
  /** A new row was created — parent refreshes the query. */
  (event: 'row-created'): void;
  /** A cell value was saved — parent refreshes the query. */
  (event: 'cell-saved'): void;
  /**
   * The renderer wants to persist a partial view config change (e.g.
   * Board picked a new `groupByPropertyId`). Parent forwards this to
   * `useDatabaseBundle.patchView`.
   */
  (event: 'view-config-changed', patch: Partial<DatabaseViewConfig>): void;
}

/** Single entry in the view registry. */
export interface DatabaseViewRegistryEntry {
  /** Discriminator — must match the `DatabaseViewType` it registers under. */
  readonly type: DatabaseViewType;
  /** Human-readable label shown in the picker and tabs. */
  readonly label: string;
  /** One-line description shown in the picker tile. */
  readonly description: string;
  /** Icon identifier from `@/assets/icons`. */
  readonly icon: AppIconName;
  /** `ready` = functional renderer; `planned` = falls back to `PlaceholderView`. */
  readonly status: 'ready' | 'planned';
  /** Vue component used to render this view. */
  readonly component: Component;
  /**
   * Default `layout` knob seeded onto a freshly-created view of this
   * type. The renderer may still operate without it (auto-detect first
   * matching property, etc.) but seeding a default keeps the saved
   * config explicit and stable across refreshes.
   */
  readonly defaultLayout?: Record<string, unknown>;
}
