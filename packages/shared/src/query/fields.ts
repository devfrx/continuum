// ===== Query — Field references =====
//
// A "field" is anything you can filter on, sort by, or project from a note.
// We unify three very different sources behind a single discriminated union
// (`FieldRef`) so the rest of the query layer — operators, value pickers,
// the graph endpoint — only ever has to know about *one* concept:
//
//   – `system`      → a built-in column on the `notes` table (title, kind…),
//   – `property`    → a custom user-defined property (see `properties.ts`),
//   – `graphMetric` → a number computed from the graph itself (degree…).
//
// Keeping all three behind `FieldRef` is what lets a kanban or table view
// mix "title contains 'todo'" with "degree > 5" without any special-casing
// at the call site.

import type { FilterOperatorId } from './filters.js';
import type { PropertyOption, StatusOption } from '../properties.js';

/**
 * Built-in note fields the query layer understands. These map 1:1 to columns
 * on the `notes` table and are stable across deployments. Adding a new entry
 * here is a coordinated change between server (filter compilation) and web
 * (field catalogue).
 */
export type SystemFieldId =
  | 'note.title'
  | 'note.kind'
  | 'note.folderId'
  | 'note.locked'
  | 'note.createdAt'
  | 'note.updatedAt'
  | 'note.tags';

/**
 * Numeric metrics derived from the graph at query time. They are not stored
 * on the note itself; the server computes them while assembling the response
 * so they can be filtered and sorted on uniformly.
 */
export type GraphMetricId = 'degree' | 'inDegree' | 'outDegree';

/**
 * View-scoped synthetic fields — derived from a view's own configuration
 * rather than from the underlying note or graph. The only entry today is
 * `view.conditionalColor`, which exposes the matched conditional-color
 * token as a filterable / sortable dimension inside Database views.
 *
 * Synthetic by design: these refs are produced by the client (the view
 * knows its own rules) and are silently ignored by server-side query
 * compilers — they never leak into the graph or database query plan.
 */
export type ViewMetaFieldId = 'view.conditionalColor';

/**
 * Discriminated reference to a queryable field. The `kind` tag is what every
 * downstream consumer (filter compiler, value picker, sort) switches on.
 *
 * For `kind: 'property'` the addressing is by `key` — the canonical,
 * scope-independent identifier of a property. The same key may be backed
 * by many `property_definitions` rows (one per note that owns it, plus
 * optional kind-scoped Templates). The query layer resolves a key into
 * the matching definition rows at evaluation time, so saved filters and
 * encodings keep working when properties are added/removed on individual
 * notes.
 *
 * For `kind: 'viewMeta'` the value is resolved from the active view's own
 * configuration (e.g. the colour token a row currently matches). These
 * refs only make sense inside the view that produced them.
 */
export type FieldRef =
  | { kind: 'system'; id: SystemFieldId }
  | { kind: 'property'; key: string }
  | { kind: 'graphMetric'; id: GraphMetricId }
  | { kind: 'viewMeta'; id: ViewMetaFieldId };

/**
 * Logical data type of a field. Drives two things:
 *   – which input control the UI renders for the value (date picker, select…),
 *   – which operators are offered in the operator menu.
 *
 * Intentionally richer than `PropertyType` because a single property type can
 * map to a different UI shape depending on context.
 */
export type FieldDataType =
  | 'string'
  | 'longText'
  | 'number'
  | 'boolean'
  | 'date'
  | 'dateRange'
  | 'select'
  | 'multiSelect'
  | 'status'
  | 'relation'
  | 'noteRef'
  | 'kindRef'
  | 'folderRef'
  | 'url'
  | 'email'
  | 'phone'
  | 'files'
  | 'verification'
  | 'progress'
  | 'uniqueId';

/**
 * High-level grouping for the field picker. Lets the UI render a sectioned
 * list ("Note", "Properties", "Graph") instead of a flat dropdown.
 */
export type FieldGroupId = 'note' | 'property' | 'graph' | 'system';

/**
 * Self-contained description of one field, ready to be rendered by the UI
 * without any further lookups. The server emits a `FieldCatalog` of these
 * (see `graph.ts → FieldCatalog`) so the client never has to derive them
 * from raw property definitions.
 */
export interface FieldDescriptor {
  /** Strongly-typed reference; what the filter ultimately stores. */
  ref: FieldRef;
  /**
   * Stable opaque key — `'sys:<id>' | 'prop:<uuid>' | 'metric:<id>'`. Used
   * as a Vue list key and as the lookup key in field maps. Round-trips with
   * `parseFieldRefKey`.
   */
  key: string;
  /** Human label shown in the picker. */
  label: string;
  /** Optional icon name (resolved by the web app's `Icon` component). */
  icon?: string | null;
  /** Optional one-liner shown as a tooltip / secondary text. */
  hint?: string | null;
  /** Section in the field picker. */
  group: FieldGroupId;
  /** Logical type — picks the value input and operator menu. */
  dataType: FieldDataType;
  /** Operators the UI should offer for this field, in display order. */
  operators: FilterOperatorId[];
  /**
   * `true` when the value picker should fetch known options from the server
   * (select / multiSelect / status / relation / kind / folder). The picker
   * decides *where* to fetch from based on `dataType`.
   */
  hasOptions?: boolean;
  /**
   * `true` when the field is read-only / auto-managed (formula, rollup,
   * createdAt…). The UI may still allow filtering on it but disables write
   * affordances elsewhere.
   */
  computed?: boolean;
  /**
   * Inline option catalogue for `select` / `multiSelect` / `status`
   * properties — the union of options across every per-note definition
   * sharing this property's key (deduped by `id`). Surfacing it on the
   * descriptor lets the filter UI render choice menus without a
   * round-trip through the per-kind property cache, which doesn't see
   * note-scoped definitions.
   */
  options?: ReadonlyArray<PropertyOption | StatusOption>;
}

/**
 * Property keys are slugs — lowercase letters, digits, underscores. Used
 * to validate the `prop:<key>` form so a malformed saved view can't sneak
 * arbitrary text into the field-ref space.
 */
const PROPERTY_KEY_RE = /^[a-z0-9_]+$/;

/**
 * Encode a `FieldRef` as a stable string key. The format is intentionally
 * tiny and human-readable so it can appear in URLs, JSON snapshots, and
 * Vue `:key` bindings without escaping.
 *
 * @example
 *   fieldRefKey({ kind: 'system', id: 'note.title' })   // 'sys:note.title'
 *   fieldRefKey({ kind: 'property', key: 'priority' })  // 'prop:priority'
 *   fieldRefKey({ kind: 'graphMetric', id: 'degree' })  // 'metric:degree'
 */
export function fieldRefKey(ref: FieldRef): string {
  switch (ref.kind) {
    case 'system':
      return `sys:${ref.id}`;
    case 'property':
      return `prop:${ref.key}`;
    case 'graphMetric':
      return `metric:${ref.id}`;
    case 'viewMeta':
      return `meta:${ref.id}`;
  }
}

/**
 * Inverse of `fieldRefKey`. Returns `null` when the key is malformed so the
 * caller can decide whether to fall back to a default field instead of
 * throwing — most call sites are loading user-saved filters where a missing
 * field shouldn't break the whole view.
 */
export function parseFieldRefKey(key: string): FieldRef | null {
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const prefix = key.slice(0, idx);
  const rest = key.slice(idx + 1);
  if (!rest) return null;
  switch (prefix) {
    case 'sys':
      return { kind: 'system', id: rest as SystemFieldId };
    case 'prop':
      return PROPERTY_KEY_RE.test(rest) ? { kind: 'property', key: rest } : null;
    case 'metric':
      return { kind: 'graphMetric', id: rest as GraphMetricId };
    case 'meta':
      return { kind: 'viewMeta', id: rest as ViewMetaFieldId };
    default:
      return null;
  }
}
