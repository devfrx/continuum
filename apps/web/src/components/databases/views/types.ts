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
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
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
  * support an inline row draft (currently `table`) watch this and open
  * their draft state when it changes. Other renderers receive draft
  * creation through `DatabaseBody`'s shared draft bar.
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
  /**
   * Declarative list of layout prerequisites consumed by the renderer.
   * `DatabaseBody` uses it to auto-bind existing properties, prompt for
   * missing database-scoped properties, and expose a same-datasource
   * table companion action for layouts that need structured properties.
   */
  readonly layoutRequirements?: readonly LayoutPropertyRequirement[];
  /**
   * Per-renderer strategy for the toolbar's primary "Add row" action.
   * Defaults to `{ mode: 'draft' }` when omitted — the parent opens the
   * shared draft bar and only creates the note when the title is
   * committed. Renderers that have their own inline-draft UX (e.g.
   * `table`) return `{ mode: 'inline-draft' }` so `DatabaseBody` knows
   * to bump the `draftRequest` counter instead. Renderers that
   * semantically can't own row creation (e.g. `chart`, which aggregates
   * existing rows) return `{ mode: 'unsupported', reason }` and the
   * parent surfaces `reason` as a one-shot toast.
   *
   * Implementations may also seed property values for the new row —
   * Calendar/Timeline use this to drop the row on "today" so it shows
   * up immediately in the active view.
   */
  readonly planAddRow?: (ctx: AddRowContext) => AddRowPlan;
}

/** A property value to seed on the freshly created row. */
export interface AddRowSeed {
  propertyId: string;
  value: PropertyValue;
}

/** Context handed to requirement and add-row planners. */
export interface ViewLayoutContext {
  database: Database;
  schema: PropertyDefinition[];
  activeView: DatabaseView;
}

export type AddRowContext = ViewLayoutContext;

/** One property-backed layout prerequisite. */
export interface LayoutPropertyRequirement {
  /** Stable id used by prompts and tests. */
  key: string;
  /** Layout key where the selected property id is stored. */
  layoutKey: string;
  /** Short label rendered in prompts. */
  label: string;
  /** One-line explanation rendered in prompts and empty states. */
  description: string;
  /** Property types that can satisfy this requirement. */
  propertyTypes: readonly PropertyType[];
  /** Suggested property label when no compatible property exists. */
  defaultLabel: string;
  /** Type preselected in the create-required-property prompt. */
  defaultType: PropertyType;
  /** Optional curated subset of types the prompt should offer. */
  createTypes?: readonly PropertyType[];
  /** Config to send when creating the property. Defaults to `defaultConfigFor(type)`. */
  defaultConfig?: (type: PropertyType) => PropertyConfig;
  /** Optional feature gate for conditional requirements (e.g. chart sum/avg). */
  requiredWhen?: (ctx: ViewLayoutContext) => boolean;
  /** Optional picker override for domain-specific preference order. */
  pickProperty?: (schema: readonly PropertyDefinition[], ctx: ViewLayoutContext) => PropertyDefinition | null;
}

/** Strategy returned by `planAddRow`. */
export type AddRowPlan =
  | { mode: 'inline-draft' }
  | { mode: 'draft'; placeholder?: string; seeds?: AddRowSeed[] }
  | { mode: 'unsupported'; reason: string };
