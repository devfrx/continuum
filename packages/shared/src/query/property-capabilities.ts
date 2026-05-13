// ===== Query — Property type capabilities =====
//
// Bridges the custom-property catalogue (`properties.ts`) with the query
// layer. For each `PropertyType` we declare:
//
//   – the logical `dataType` the value picker should render,
//   – the operators that make sense in the operator menu,
//   – whether the value is server-computed (read-only),
//   – whether it produces graph edges (only `relation`),
//   – whether the value picker should fetch known options.
//
// Centralising this mapping means the field catalogue (`/api/query/fields`)
// and the kanban/table views all derive their behaviour from one table —
// adding a new property type is a single edit here, not a hunt across the
// codebase.

import type { PropertyType } from '../properties.js';
import type { FieldDataType } from './fields.js';
import type { FilterOperatorId } from './filters.js';

/**
 * Per-`PropertyType` UI + query metadata. Consumed by the field-catalogue
 * builder server-side and by the value picker on the web.
 */
export interface PropertyTypeCapability {
  /** Logical type — drives the value editor and operator menu. */
  dataType: FieldDataType;
  /** Operators offered for this property type, in display order. */
  operators: FilterOperatorId[];
  /** `true` when the value is fully computed/managed server-side. */
  computed: boolean;
  /** `true` when this property emits edges into the graph (only `relation`). */
  edgeSource: boolean;
  /** `true` when the value picker should fetch known options from the API. */
  hasOptions: boolean;
}

// ───────── Operator presets (deduped for readability) ─────────

const STRING_OPS: FilterOperatorId[] = [
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
];

const NUMBER_OPS: FilterOperatorId[] = [
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
];

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

const SELECT_OPS: FilterOperatorId[] = [
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'inAny',
  'notIn',
];

const MULTI_OPS: FilterOperatorId[] = [
  'isEmpty',
  'isNotEmpty',
  'inAny',
  'inAll',
  'notIn',
];

const PRESENCE_ONLY: FilterOperatorId[] = ['isEmpty', 'isNotEmpty'];

/**
 * The single source of truth mapping each `PropertyType` to its query-layer
 * capabilities. Exhaustive — every entry of the `PROPERTY_TYPES` const has
 * a row here, enforced by the `Record<PropertyType, …>` type.
 */
export const PROPERTY_TYPE_CAPABILITIES: Record<PropertyType, PropertyTypeCapability> = {
  // ── Basics ───────────────────────────────────────────────────────────
  text: {
    dataType: 'string',
    operators: STRING_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  longText: {
    dataType: 'longText',
    operators: STRING_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  number: {
    dataType: 'number',
    operators: NUMBER_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  checkbox: {
    dataType: 'boolean',
    operators: ['isTrue', 'isFalse'],
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  url: {
    dataType: 'url',
    operators: STRING_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  email: {
    dataType: 'email',
    operators: STRING_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  phone: {
    dataType: 'phone',
    operators: STRING_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  date: {
    dataType: 'date',
    operators: DATE_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  dateRange: {
    dataType: 'dateRange',
    operators: ['isEmpty', 'isNotEmpty', 'inRange'],
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  files: {
    dataType: 'files',
    operators: PRESENCE_ONLY,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },

  // ── Choice ───────────────────────────────────────────────────────────
  select: {
    dataType: 'select',
    operators: SELECT_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: true,
  },
  multiSelect: {
    dataType: 'multiSelect',
    operators: MULTI_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: true,
  },
  status: {
    dataType: 'status',
    operators: SELECT_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: true,
  },

  // ── Links ────────────────────────────────────────────────────────────
  relation: {
    dataType: 'relation',
    operators: MULTI_OPS,
    computed: false,
    edgeSource: true,
    hasOptions: true,
  },
  rollup: {
    dataType: 'string',
    operators: PRESENCE_ONLY,
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },

  // ── Compute & actions ────────────────────────────────────────────────
  formula: {
    dataType: 'string',
    operators: PRESENCE_ONLY,
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },
  button: {
    dataType: 'string',
    operators: [],
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },

  // ── Auto-managed ─────────────────────────────────────────────────────
  createdTime: {
    dataType: 'date',
    operators: DATE_OPS,
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },
  createdBy: {
    dataType: 'string',
    operators: ['isEmpty', 'isNotEmpty', 'eq', 'neq'],
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },
  lastEditedTime: {
    dataType: 'date',
    operators: DATE_OPS,
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },
  lastEditedBy: {
    dataType: 'string',
    operators: ['isEmpty', 'isNotEmpty', 'eq', 'neq'],
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },
  uniqueId: {
    dataType: 'uniqueId',
    operators: ['isEmpty', 'isNotEmpty', 'eq', 'neq', 'contains'],
    computed: true,
    edgeSource: false,
    hasOptions: false,
  },

  // ── Tracking ─────────────────────────────────────────────────────────
  verification: {
    dataType: 'verification',
    operators: ['isEmpty', 'isNotEmpty', 'eq', 'neq', 'inAny'],
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
  progress: {
    dataType: 'progress',
    operators: NUMBER_OPS,
    computed: false,
    edgeSource: false,
    hasOptions: false,
  },
};
