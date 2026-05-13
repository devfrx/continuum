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
 *  – Property definitions — every kind-scoped + global property is
 *    surfaced as one descriptor; `dataType`, `operators`, `hasOptions`
 *    and `computed` come straight from `PROPERTY_TYPE_CAPABILITIES`.
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
  type PropertyType,
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
  const systemGroup: FieldGroupId = 'note';
  for (const sys of SYSTEM_FIELDS) {
    fields.push({
      ref: { kind: 'system', id: sys.id },
      key: fieldRefKey({ kind: 'system', id: sys.id }),
      label: sys.label,
      icon: sys.icon,
      hint: 'Note',
      group: systemGroup,
      dataType: sys.dataType,
      operators: sys.operators,
      hasOptions: sys.hasOptions ?? false,
      computed: sys.id === 'note.createdAt' || sys.id === 'note.updatedAt',
    });
  }

  // ── Property fields ─────────────────────────────────────────────────
  const [allDefs, allKinds] = await Promise.all([
    db
      .select()
      .from(propertyDefinitions)
      .orderBy(asc(propertyDefinitions.kindId), asc(propertyDefinitions.position)),
    db.select().from(kinds),
  ]);
  const kindLabelById = new Map(allKinds.map((k) => [k.id, k.label] as const));

  const propertyGroup: FieldGroupId = 'property';
  for (const def of allDefs) {
    const cap = PROPERTY_TYPE_CAPABILITIES[def.type as PropertyType];
    if (!cap) continue;
    const hint =
      def.scope === 'global'
        ? 'Global'
        : (def.kindId && kindLabelById.get(def.kindId)) || def.kindId || 'Kind';
    fields.push({
      ref: { kind: 'property', propertyId: def.id },
      key: fieldRefKey({ kind: 'property', propertyId: def.id }),
      label: def.label,
      icon: def.icon ?? null,
      hint,
      group: propertyGroup,
      dataType: cap.dataType,
      operators: cap.operators,
      hasOptions: cap.hasOptions,
      computed: cap.computed,
    });
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
