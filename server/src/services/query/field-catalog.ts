/**
 * Field catalogue — builds the `FieldCatalog` returned by
 * `GET /api/query/fields`.
 *
 * The web app's filter UI is data-driven: it walks the catalogue and
 * renders a field picker plus an operator menu without hard-coding a
 * single field. Centralising the assembly here means the server is the
 * single source of truth for "what can I filter on?" — the only place a
 * new system field needs to be wired.
 *
 * Three sections feed the catalogue:
 *
 *  – System fields (`note.title`, `note.kind`…) — hardcoded list with the
 *    operator preset that matches each column's data type.
 *  – Property definitions — grouped by `key` so the picker shows one
 *    entry per logical property even when many notes own a per-note copy
 *    of the same definition. The first definition encountered for a key
 *    wins for label/icon/type; option lists are unioned across all defs
 *    sharing the key so the value picker sees every selectable option.
 *  – Graph metrics (`degree`, `inDegree`, `outDegree`) — appended only
 *    when `surface === 'graph'`. They never carry presence operators
 *    because metrics are always defined for every node.
 */
import { asc } from 'drizzle-orm';
import {
  PROPERTY_TYPE_CAPABILITIES,
  fieldRefKey,
  type FieldCatalog,
  type FieldDescriptor,
  type FieldGroupId,
  type FilterOperatorId,
  type GraphMetricId,
  type PropertyOption,
  type PropertyType,
  type StatusOption,
  type SystemFieldId,
} from '@continuum/shared';
import { db } from '../../db/client.js';
import { kinds, propertyDefinitions } from '../../db/schema.js';

interface SystemFieldSpec {
  id: SystemFieldId;
  label: string;
  icon: string;
  dataType: FieldDescriptor['dataType'];
  operators: FilterOperatorId[];
  hasOptions?: boolean;
}

const DATE_OPS: FilterOperatorId[] = [
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'before',
  'after',
  'onOrBefore',
  'onOrAfter',
  'inRange',
  'today',
  'thisWeek',
  'thisMonth',
  'thisYear',
  'lastNDays',
  'nextNDays',
];

const SYSTEM_FIELDS: SystemFieldSpec[] = [
  {
    id: 'note.title',
    label: 'Title',
    icon: 'note-title',
    dataType: 'string',
    operators: [
      'isEmpty',
      'isNotEmpty',
      'eq',
      'neq',
      'contains',
      'notContains',
      'startsWith',
      'endsWith',
    ],
  },
  {
    id: 'note.kind',
    label: 'Kind',
    icon: 'kind-custom',
    dataType: 'kindRef',
    operators: ['eq', 'neq', 'inAny', 'notIn'],
    hasOptions: true,
  },
  {
    id: 'note.folderId',
    label: 'Folder',
    icon: 'folder',
    dataType: 'folderRef',
    operators: ['isEmpty', 'isNotEmpty', 'eq', 'neq', 'inAny', 'notIn'],
    hasOptions: true,
  },
  {
    id: 'note.locked',
    label: 'Locked',
    icon: 'lock',
    dataType: 'boolean',
    operators: ['isTrue', 'isFalse'],
  },
  {
    id: 'note.createdAt',
    label: 'Created at',
    icon: 'clock',
    dataType: 'date',
    operators: DATE_OPS,
  },
  {
    id: 'note.updatedAt',
    label: 'Updated at',
    icon: 'clock',
    dataType: 'date',
    operators: DATE_OPS,
  },
  {
    id: 'note.tags',
    label: 'Tags',
    icon: 'tag',
    dataType: 'multiSelect',
    operators: ['isEmpty', 'isNotEmpty', 'inAny', 'inAll', 'notIn'],
  },
];

interface GraphMetricSpec {
  id: GraphMetricId;
  label: string;
  icon: string;
}

const GRAPH_METRICS: GraphMetricSpec[] = [
  { id: 'degree', label: 'Degree', icon: 'graph' },
  { id: 'inDegree', label: 'In-degree', icon: 'graph' },
  { id: 'outDegree', label: 'Out-degree', icon: 'graph' },
];

const GRAPH_METRIC_OPERATORS: FilterOperatorId[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
];

export interface BuildFieldCatalogOptions {
  /** Which field set the caller intends to use the catalogue for. */
  surface: 'graph' | 'note';
}

/**
 * Build the field catalogue for the requested surface.
 *
 * For `surface='note'` the catalogue contains only system fields and
 * property fields. For `surface='graph'` it additionally appends the
 * three graph-metric fields.
 *
 * Property fields are emitted in `(scope, kindId, position)` order so the
 * UI can render kind sections in a stable shape.
 */
export async function buildFieldCatalog(
  opts: BuildFieldCatalogOptions,
): Promise<FieldCatalog> {
  const fields: FieldDescriptor[] = [];

  // ── System fields ───────────────────────────────────────────────────
  // System fields apply uniformly to every note regardless of kind, so
  // their hint reads "System" — not "Note" — to avoid being confused with
  // the user-defined `note` kind. The descriptor's `group` stays `note`
  // so the picker still nests them under the "Note" section header.
  const systemGroup: FieldGroupId = 'note';
  for (const sys of SYSTEM_FIELDS) {
    fields.push({
      ref: { kind: 'system', id: sys.id },
      key: fieldRefKey({ kind: 'system', id: sys.id }),
      label: sys.label,
      icon: sys.icon,
      hint: 'System',
      group: systemGroup,
      dataType: sys.dataType,
      operators: sys.operators,
      hasOptions: sys.hasOptions ?? false,
      computed: sys.id === 'note.createdAt' || sys.id === 'note.updatedAt',
    });
  }

  // ── Property fields ─────────────────────────────────────────────────
  // Property fields are addressed by `key` (one descriptor per distinct
  // key) so the picker stays clean even when 50 notes each own a copy of
  // the same per-note definition. Within a key the first definition
  // encountered wins for label/icon/type; choice options are unioned
  // across every definition sharing the key (deduped by id) so the
  // value picker sees the full catalogue.
  const [allDefs, allKinds] = await Promise.all([
    db
      .select()
      .from(propertyDefinitions)
      .orderBy(asc(propertyDefinitions.kindId), asc(propertyDefinitions.position)),
    db.select().from(kinds),
  ]);
  const kindLabelById = new Map(allKinds.map((k) => [k.id, k.label] as const));

  interface KeyGroup {
    representative: (typeof allDefs)[number];
    kindIds: Set<string>;
    scopes: Set<string>;
    options: Map<string, PropertyOption | StatusOption>;
  }

  const byKey = new Map<string, KeyGroup>();
  for (const def of allDefs) {
    // Database-scoped definitions belong to a single Database and must
    // never leak into the global graph/note field picker — they get
    // their own catalogue scoped to the owning database.
    if (def.scope === 'database') continue;
    const cap = PROPERTY_TYPE_CAPABILITIES[def.type as PropertyType];
    if (!cap) continue;
    let group = byKey.get(def.key);
    if (!group) {
      group = {
        representative: def,
        kindIds: new Set(),
        scopes: new Set(),
        options: new Map(),
      };
      byKey.set(def.key, group);
    }
    group.scopes.add(def.scope);
    if (def.kindId) group.kindIds.add(def.kindId);
    if (cap.hasOptions) {
      const cfg = def.config as { options?: ReadonlyArray<PropertyOption | StatusOption> };
      for (const opt of cfg?.options ?? []) {
        if (!group.options.has(opt.id)) group.options.set(opt.id, opt);
      }
    }
  }

  const propertyGroup: FieldGroupId = 'property';
  for (const [key, group] of byKey) {
    const def = group.representative;
    const cap = PROPERTY_TYPE_CAPABILITIES[def.type as PropertyType];
    if (!cap) continue;
    const hint = computePropertyHint(group.scopes, group.kindIds, kindLabelById);
    const descriptor: FieldDescriptor = {
      ref: { kind: 'property', key },
      key: fieldRefKey({ kind: 'property', key }),
      label: def.label,
      icon: def.icon ?? null,
      hint,
      group: propertyGroup,
      dataType: cap.dataType,
      operators: cap.operators,
      hasOptions: cap.hasOptions,
      computed: cap.computed,
    };
    if (cap.hasOptions && group.options.size > 0) {
      descriptor.options = Array.from(group.options.values());
    }
    fields.push(descriptor);
  }

  // ── Graph metrics (graph surface only) ──────────────────────────────
  if (opts.surface === 'graph') {
    const graphGroup: FieldGroupId = 'graph';
    for (const m of GRAPH_METRICS) {
      fields.push({
        ref: { kind: 'graphMetric', id: m.id },
        key: fieldRefKey({ kind: 'graphMetric', id: m.id }),
        label: m.label,
        icon: m.icon,
        hint: 'Graph metric',
        group: graphGroup,
        dataType: 'number',
        operators: GRAPH_METRIC_OPERATORS,
        hasOptions: false,
        computed: true,
      });
    }
  }

  return { fields };
}

/**
 * Render the secondary hint shown below a property's label in the
 * picker. A key that is purely global stays `Global`; a key owned by
 * note-scoped definitions only gets a generic `Property` hint (we
 * deliberately don't enumerate owning notes); a key bound to a single
 * kind names that kind. Anything spanning multiple kinds collapses to
 * `Multiple` so the hint stays one line.
 */
function computePropertyHint(
  scopes: Set<string>,
  kindIds: Set<string>,
  kindLabelById: Map<string, string>,
): string {
  if (scopes.size === 1 && scopes.has('global')) return 'Global';
  if (kindIds.size === 0) return 'Property';
  if (kindIds.size === 1) {
    const [only] = kindIds;
    return (only && kindLabelById.get(only)) || only || 'Kind';
  }
  return 'Multiple';
}
