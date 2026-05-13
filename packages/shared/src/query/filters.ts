// ===== Query — Filter tree =====
//
// A filter is a tree of conditions joined by `and` / `or`. Conditions point
// at a `FieldRef` and pair an operator with a typed value. The tree shape
// (instead of a flat array) is what unlocks expressive queries like
// "(title contains 'todo' OR tags contains 'urgent') AND status = 'open'"
// without inventing a custom mini-language.
//
// Values live in their own discriminated union (`FilterValue`) so that the
// filter compiler on the server, the value picker on the web, and the
// JSON-on-the-wire form all see the exact same shape — no implicit `any`,
// no string-typed dates, no overloading.

import type { FieldRef } from './fields.js';

/**
 * Every operator the query layer understands. Most map onto a SQL predicate
 * but the date-range presets (`today`, `thisWeek`, `lastNDays`…) are
 * compiled server-side relative to the request time so saved filters keep
 * meaning the same thing tomorrow.
 */
export type FilterOperatorId =
  // Presence
  | 'isEmpty'
  | 'isNotEmpty'
  // Equality
  | 'eq'
  | 'neq'
  // String
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  // Numeric / ordinal
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  // Boolean
  | 'isTrue'
  | 'isFalse'
  // Set
  | 'inAny'
  | 'inAll'
  | 'notIn'
  // Date — absolute
  | 'before'
  | 'after'
  | 'onOrBefore'
  | 'onOrAfter'
  | 'inRange'
  // Date — relative presets
  | 'today'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisYear'
  | 'lastNDays'
  | 'nextNDays';

/**
 * Discriminated union of every value shape an operator can carry.
 *
 * `kind: 'none'` is reserved for unary operators (`isEmpty`, `today`…) so
 * that `FilterCondition.value` is always present — callers never have to
 * check for `undefined`. Dates are ISO-8601 strings (UTC); durations are
 * non-negative integer days so relative-date operators can be evaluated
 * deterministically server-side.
 */
export type FilterValue =
  | { kind: 'none' }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'numberRange'; from: number; to: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; value: string }
  | { kind: 'dateRange'; from: string; to: string }
  | { kind: 'duration'; days: number }
  | { kind: 'stringList'; values: string[] };

/**
 * A leaf node in the filter tree. `id` is a client-generated string used as
 * a Vue `:key` and to patch the node in place when the user edits it; the
 * server treats it as an opaque token and echoes it back unchanged.
 */
export interface FilterCondition {
  type: 'condition';
  /** Stable client-generated id (UI keying / patching). */
  id: string;
  /** Field being filtered. */
  field: FieldRef;
  /** Operator applied to `field` and `value`. */
  operator: FilterOperatorId;
  /** Typed value (use `{ kind: 'none' }` for unary operators). */
  value: FilterValue;
}

/**
 * An internal node — combines its `children` with `combinator`. Empty groups
 * are valid and evaluate to "match everything" so the UI can render a clean
 * starting state without a special "no filter" sentinel.
 */
export interface FilterGroup {
  type: 'group';
  /** Stable client-generated id. */
  id: string;
  /** Logical operator applied across `children`. */
  combinator: 'and' | 'or';
  /** Child nodes, evaluated left-to-right. */
  children: FilterNode[];
}

/** Either kind of node in the filter tree. */
export type FilterNode = FilterCondition | FilterGroup;

/**
 * Canonical empty filter. Use this as the seed for new query builders —
 * it always evaluates to "match everything" so a fresh view shows all rows.
 *
 * Not deeply frozen; callers that mutate it in place would corrupt the
 * shared instance, so always treat it as a starting *shape* and clone with
 * `structuredClone` (or build a fresh literal) before editing.
 */
export const EMPTY_FILTER_GROUP: FilterGroup = {
  type: 'group',
  id: 'root',
  combinator: 'and',
  children: [],
};

/** Type guard — `true` when the node combines other nodes. */
export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return node.type === 'group';
}

/** Type guard — `true` when the node is a leaf condition. */
export function isFilterCondition(node: FilterNode): node is FilterCondition {
  return node.type === 'condition';
}

/**
 * `true` when the tree contains zero conditions (recursively). Useful to
 * decide whether to show a "no filter" hint or to skip sending the filter
 * over the wire.
 */
export function isFilterEmpty(node: FilterNode): boolean {
  if (isFilterCondition(node)) return false;
  for (const child of node.children) {
    if (!isFilterEmpty(child)) return false;
  }
  return true;
}

/**
 * Per-operator metadata used by the UI to render the operator menu and to
 * decide which value editor to mount when the user picks an operator.
 */
export interface FilterOperatorDescriptor {
  id: FilterOperatorId;
  /** Crisp English label shown in the operator dropdown. */
  label: string;
  /**
   * Which `FilterValue.kind`s the operator accepts. `['none']` marks a unary
   * operator (the value picker is hidden). When more than one kind is listed
   * the UI may offer a sub-mode toggle (rare today; reserved for future use).
   */
  valueKinds: FilterValue['kind'][];
}

/**
 * Static registry of every operator's UI metadata. Kept as a `Record` so the
 * lookup is O(1) and TypeScript guarantees exhaustiveness — adding a new
 * `FilterOperatorId` without an entry here is a compile error.
 */
export const FILTER_OPERATORS: Record<FilterOperatorId, FilterOperatorDescriptor> = {
  isEmpty: { id: 'isEmpty', label: 'is empty', valueKinds: ['none'] },
  isNotEmpty: { id: 'isNotEmpty', label: 'is not empty', valueKinds: ['none'] },

  eq: { id: 'eq', label: 'equals', valueKinds: ['string', 'number', 'boolean', 'date'] },
  neq: {
    id: 'neq',
    label: 'does not equal',
    valueKinds: ['string', 'number', 'boolean', 'date'],
  },

  contains: { id: 'contains', label: 'contains', valueKinds: ['string'] },
  notContains: { id: 'notContains', label: 'does not contain', valueKinds: ['string'] },
  startsWith: { id: 'startsWith', label: 'starts with', valueKinds: ['string'] },
  endsWith: { id: 'endsWith', label: 'ends with', valueKinds: ['string'] },

  gt: { id: 'gt', label: 'is greater than', valueKinds: ['number'] },
  gte: { id: 'gte', label: 'is greater than or equal to', valueKinds: ['number'] },
  lt: { id: 'lt', label: 'is less than', valueKinds: ['number'] },
  lte: { id: 'lte', label: 'is less than or equal to', valueKinds: ['number'] },
  between: { id: 'between', label: 'is between', valueKinds: ['numberRange'] },

  isTrue: { id: 'isTrue', label: 'is checked', valueKinds: ['none'] },
  isFalse: { id: 'isFalse', label: 'is unchecked', valueKinds: ['none'] },

  inAny: { id: 'inAny', label: 'is any of', valueKinds: ['stringList'] },
  inAll: { id: 'inAll', label: 'contains all of', valueKinds: ['stringList'] },
  notIn: { id: 'notIn', label: 'is none of', valueKinds: ['stringList'] },

  before: { id: 'before', label: 'is before', valueKinds: ['date'] },
  after: { id: 'after', label: 'is after', valueKinds: ['date'] },
  onOrBefore: { id: 'onOrBefore', label: 'is on or before', valueKinds: ['date'] },
  onOrAfter: { id: 'onOrAfter', label: 'is on or after', valueKinds: ['date'] },
  inRange: { id: 'inRange', label: 'is between dates', valueKinds: ['dateRange'] },

  today: { id: 'today', label: 'is today', valueKinds: ['none'] },
  thisWeek: { id: 'thisWeek', label: 'is this week', valueKinds: ['none'] },
  thisMonth: { id: 'thisMonth', label: 'is this month', valueKinds: ['none'] },
  thisYear: { id: 'thisYear', label: 'is this year', valueKinds: ['none'] },
  lastNDays: { id: 'lastNDays', label: 'in the last N days', valueKinds: ['duration'] },
  nextNDays: { id: 'nextNDays', label: 'in the next N days', valueKinds: ['duration'] },
};
