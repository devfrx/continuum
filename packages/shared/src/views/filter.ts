// ===== Filter trees for Database Views =====
//
// Recursive AND/OR groups + leaf rules, mirroring Notion's filter UI. The
// shape is intentionally permissive at the type level (operators/values are
// only loosely constrained per property type) — the server performs strict
// validation against the materialised property type at query time.

import { z } from 'zod';
import { PROPERTY_TYPES, type PropertyType } from '../properties.js';

// ───────── Operators ─────────

/**
 * Full operator alphabet. Each property type only supports a subset; see
 * {@link OPERATORS_BY_TYPE} for the mapping.
 */
export const FILTER_OPERATORS = [
  // Equality / set membership.
  'equals',
  'not_equals',
  'is',
  'is_not',
  'contains',
  'not_contains',
  'contains_all',
  'starts_with',
  'ends_with',
  // Numeric / ordinal.
  'gt',
  'gte',
  'lt',
  'lte',
  // Date specific.
  'before',
  'after',
  'on_or_before',
  'on_or_after',
  'between',
  'relative',
  // Empty checks.
  'is_empty',
  'is_not_empty',
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/**
 * Relative-date presets accepted by the `'relative'` operator. These are
 * resolved server-side to absolute timestamps using the request's clock so
 * stored views stay live ("today" really means "today" at query time).
 */
export const RELATIVE_DATE_PRESETS = [
  'today',
  'tomorrow',
  'yesterday',
  'this_week',
  'last_week',
  'next_week',
  'this_month',
  'last_month',
  'next_month',
  'past',
  'future',
] as const;

export type RelativeDatePreset = (typeof RELATIVE_DATE_PRESETS)[number];

/**
 * Verification states accepted by the `verification` property's `is`/`is_not`
 * operators. Mirrors `VerificationState` from `properties.ts` but redeclared
 * locally to avoid coupling the schema to the value union.
 */
export const VERIFICATION_FILTER_STATES = ['verified', 'unverified', 'expired'] as const;
export type VerificationFilterState = (typeof VERIFICATION_FILTER_STATES)[number];

// ───────── Operators per property type ─────────

const TEXTUAL: FilterOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
];

const NUMERIC: FilterOperator[] = [
  'equals',
  'not_equals',
  'gt',
  'gte',
  'lt',
  'lte',
  'is_empty',
  'is_not_empty',
];

const DATE: FilterOperator[] = [
  'equals',
  'before',
  'after',
  'on_or_before',
  'on_or_after',
  'between',
  'is_empty',
  'is_not_empty',
  'relative',
];

const SELECTION: FilterOperator[] = ['equals', 'not_equals', 'is_empty', 'is_not_empty'];

const FORMULA_LIKE: FilterOperator[] = [
  'equals',
  'not_equals',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
];

/**
 * Per-property-type operator catalogue. UI uses this to populate the
 * operator dropdown; server uses it as a first-pass validation gate before
 * evaluating the actual rule.
 */
export const OPERATORS_BY_TYPE: Record<PropertyType, FilterOperator[]> = {
  text: TEXTUAL,
  longText: TEXTUAL,
  url: TEXTUAL,
  email: TEXTUAL,
  phone: TEXTUAL,
  uniqueId: TEXTUAL,
  number: NUMERIC,
  progress: NUMERIC,
  checkbox: ['is', 'is_not'],
  date: DATE,
  createdTime: DATE,
  lastEditedTime: DATE,
  dateRange: DATE,
  select: SELECTION,
  status: SELECTION,
  multiSelect: ['contains', 'not_contains', 'contains_all', 'is_empty', 'is_not_empty'],
  relation: ['contains', 'not_contains', 'is_empty', 'is_not_empty'],
  files: ['is_empty', 'is_not_empty'],
  verification: ['is', 'is_not'],
  formula: FORMULA_LIKE,
  rollup: FORMULA_LIKE,
  createdBy: SELECTION,
  lastEditedBy: SELECTION,
  // Buttons are stateless; no value to filter on.
  button: [],
};

// Static-only sanity check that the map covers every property type.
const _COVERAGE_CHECK: ReadonlyArray<PropertyType> = PROPERTY_TYPES;
void _COVERAGE_CHECK;

// ───────── Values ─────────

/**
 * Loose union of every shape a leaf-rule value may take. The server
 * narrows this to the operator+type-specific shape on validation.
 *
 *  - `string` — text, single id (select/status/relation), date ISO string
 *  - `number` — numeric / progress comparisons
 *  - `boolean` — checkbox `is`/`is_not`
 *  - `string[]` — multiSelect option ids, relation note ids
 *  - `{ from, to }` — `between` operator on dates
 *  - `{ preset }` — `relative` operator on dates
 *  - `null` / undefined — empty-check operators carry no value
 */
export const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.object({ from: z.string(), to: z.string() }),
  z.object({ preset: z.enum(RELATIVE_DATE_PRESETS) }),
  z.null(),
]);

export type FilterValue = z.infer<typeof filterValueSchema>;

// ───────── Rule + recursive group ─────────

/** Boolean combinator used by {@link FilterGroup}. */
export type FilterCombinator = 'and' | 'or';

/** A single leaf condition on one property. */
export interface FilterRule {
  type: 'rule';
  /** Stable property key (slug) on the owning kind. */
  propertyKey: string;
  operator: FilterOperator;
  /** Operator-dependent payload. Omit for `is_empty` / `is_not_empty`. */
  value?: FilterValue;
}

/** Either a leaf rule or a nested group. */
export type FilterNode = FilterGroup | FilterRule;

/** A boolean group combining child nodes with AND or OR. */
export interface FilterGroup {
  type: 'group';
  combinator: FilterCombinator;
  rules: FilterNode[];
}

/** Top-level filter is always a group; an empty `rules[]` matches every row. */
export type FilterTree = FilterGroup;

// ───────── Schemas ─────────

/** Zod schema for a leaf {@link FilterRule}. */
export const filterRuleSchema: z.ZodType<FilterRule> = z.object({
  type: z.literal('rule'),
  propertyKey: z.string().min(1),
  operator: z.enum(FILTER_OPERATORS),
  value: filterValueSchema.optional(),
});

/**
 * Zod schema for a {@link FilterGroup}. Built lazily so the recursive
 * `rules: (group | rule)[]` reference resolves without a forward declaration.
 */
export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    type: z.literal('group'),
    combinator: z.enum(['and', 'or']),
    rules: z.array(z.union([filterGroupSchema, filterRuleSchema])),
  }),
);

/** Top-level alias matching {@link FilterTree}. */
export const filterTreeSchema: z.ZodType<FilterTree> = filterGroupSchema;

/** Convenience: an empty AND group, matching every row. */
export function emptyFilterTree(): FilterTree {
  return { type: 'group', combinator: 'and', rules: [] };
}
