/**
 * Filter planner — recursive translator from a `FilterNode` tree to the
 * `WHERE` clause of a `notes` query, plus a residual list of conditions
 * that have to be evaluated in JS after the graph is in memory.
 *
 * Why split the work?
 *
 *  – System fields (`note.title`, `note.kind`…) and stored property values
 *    are cheap in SQL: an index lookup or a `?|` jsonb test does the job.
 *  – Graph-metric fields (`degree`, `inDegree`, `outDegree`) require us to
 *    have already assembled the edge set. There's no good way to express
 *    them as a SQL predicate over `notes` without an expensive join, so we
 *    defer them to a JS pass over the assembled graph.
 *
 * Combinator handling:
 *
 *  – `and` is the easy case: AND the SQL fragments of all children that
 *    produced one and concatenate their post-filters. The post-filters
 *    are evaluated as AND in `applyMetricPostFilters`, so the semantics
 *    line up perfectly.
 *  – `or` is harder. If every child is SQL-only we OR them. If any child
 *    is metric-only we cannot express the OR in SQL without first having
 *    the metrics, so we degrade: the SQL becomes a permissive
 *    over-approximation (`true` over the metric-bearing branch) and the
 *    metric conditions are forwarded as post-filters. This means OR
 *    groups that mix metric and non-metric children behave like AND for
 *    the metric branch — documented limitation, not a bug. Pure-OR groups
 *    of metric conditions still work because `applyMetricPostFilters`
 *    accepts a root combinator.
 */
import { and, or, sql, type SQL } from 'drizzle-orm';
import type {
  FieldRef,
  FilterCondition,
  FilterNode,
  GraphMetricId,
  SystemFieldId,
} from '@continuum/shared';
import { isFilterCondition, isFilterGroup } from '@continuum/shared';
import { notes, type PropertyDefinitionRow } from '../../db/schema.js';
import { buildDateOnColumn, buildPropertyConditionSQL } from './property-value-sql.js';
import { validateOperatorValue } from './operator-registry.js';
import { jsonbStringArray, textArray } from './sql-values.js';

/** Outcome of planning one node. `sql` is null when the node carries no SQL. */
export interface PlanResult {
  sql: SQL | null;
  postFilters: FilterCondition[];
}

/**
 * Lookup table the planner consults for `property`-flavoured conditions.
 *
 * Keyed by the property's canonical `key` because that's what the filter
 * tree carries; the value is the *array* of definition rows sharing that
 * key. Per-note properties create one row per owning note, so a single
 * filter condition typically resolves to many definition ids — the SQL
 * builder receives the full list and emits a `property_id IN (...)`
 * predicate so the condition matches across every backing definition.
 */
export type PropertyDefIndex = Map<string, PropertyDefinitionRow[]>;

/**
 * Recursively translate a filter node into a SQL fragment and a residual
 * list of metric-only conditions. The returned SQL — when non-null — is
 * always safe to drop into the outer `notes` query's `WHERE` as-is.
 *
 * @param node    The current tree node.
 * @param defs    Property definitions referenced by `property` fields,
 *                grouped by canonical key. Conditions whose key is
 *                missing or resolves to zero definitions match everything
 *                (we don't want a stale saved view to crash).
 * @param now     Reference time for relative date operators.
 */
export function planFilter(
  node: FilterNode,
  defs: PropertyDefIndex,
  now: Date = new Date(),
): PlanResult {
  if (isFilterCondition(node)) return planCondition(node, defs, now);
  if (isFilterGroup(node)) {
    if (node.children.length === 0) return { sql: null, postFilters: [] };
    const childResults = node.children.map((c) => planFilter(c, defs, now));

    if (node.combinator === 'and') {
      const sqlParts = childResults.map((r) => r.sql).filter((s): s is SQL => s !== null);
      const postFilters = childResults.flatMap((r) => r.postFilters);
      const combined = sqlParts.length === 0 ? null : (and(...sqlParts) ?? null);
      return { sql: combined ?? null, postFilters };
    }

    // OR
    const anyMetric = childResults.some((r) => r.postFilters.length > 0);
    if (!anyMetric) {
      const sqlParts = childResults.map((r) => r.sql).filter((s): s is SQL => s !== null);
      const combined = sqlParts.length === 0 ? null : (or(...sqlParts) ?? null);
      return { sql: combined ?? null, postFilters: [] };
    }

    // Mixed OR — degrade per the JSDoc above.
    const sqlParts = childResults
      .filter((r) => r.postFilters.length === 0)
      .map((r) => r.sql)
      .filter((s): s is SQL => s !== null);
    const postFilters = childResults.flatMap((r) => r.postFilters);
    const combined = sqlParts.length === 0 ? null : (or(...sqlParts) ?? null);
    return { sql: combined ?? null, postFilters };
  }
  return { sql: null, postFilters: [] };
}

// ───────────────────── per-condition translation ─────────────────────

function planCondition(
  condition: FilterCondition,
  defs: PropertyDefIndex,
  now: Date,
): PlanResult {
  const { field } = condition;
  switch (field.kind) {
    case 'system':
      return { sql: planSystem(field.id, condition, now), postFilters: [] };
    case 'property': {
      const matching = defs.get(field.key);
      if (!matching || matching.length === 0) return { sql: sql`true`, postFilters: [] };
      return { sql: buildPropertyConditionSQL(matching, condition, now), postFilters: [] };
    }
    case 'graphMetric':
      return { sql: null, postFilters: [condition] };
  }
}

// ─────────────────────── system field predicates ──────────────────────

function planSystem(id: SystemFieldId, condition: FilterCondition, now: Date): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (id) {
    case 'note.title':
      return planTextColumn(sql`${notes.title}`, condition);
    case 'note.kind':
      return planTextColumn(sql`${notes.kind}`, condition);
    case 'note.folderId':
      return planFolderId(condition);
    case 'note.locked':
      return planBooleanColumn(sql`${notes.locked}`, condition);
    case 'note.createdAt':
      return buildDateOnColumn(sql`${notes.createdAt}`, operator, value, now, null, false);
    case 'note.updatedAt':
      return buildDateOnColumn(sql`${notes.updatedAt}`, operator, value, now, null, false);
    case 'note.tags':
      return planTagsColumn(condition);
  }
}

function planTextColumn(column: SQL, condition: FilterCondition): SQL {
  const { operator, value } = condition;
  switch (operator) {
    case 'isEmpty':
      return sql`(${column} IS NULL OR ${column} = '')`;
    case 'isNotEmpty':
      return sql`(${column} IS NOT NULL AND ${column} <> '')`;
    case 'eq':
      if (value.kind !== 'string') return sql`false`;
      return sql`${column} = ${value.value}`;
    case 'neq':
      if (value.kind !== 'string') return sql`true`;
      return sql`${column} <> ${value.value}`;
    case 'contains':
      if (value.kind !== 'string') return sql`false`;
      return sql`${column} ILIKE ${'%' + escapeLike(value.value) + '%'}`;
    case 'notContains':
      if (value.kind !== 'string') return sql`true`;
      return sql`${column} NOT ILIKE ${'%' + escapeLike(value.value) + '%'}`;
    case 'startsWith':
      if (value.kind !== 'string') return sql`false`;
      return sql`${column} ILIKE ${escapeLike(value.value) + '%'}`;
    case 'endsWith':
      if (value.kind !== 'string') return sql`false`;
      return sql`${column} ILIKE ${'%' + escapeLike(value.value)}`;
    case 'inAny':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return sql`${column} = ANY(${textArray(value.values)})`;
    case 'notIn':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`true`;
      return sql`${column} <> ALL(${textArray(value.values)})`;
    default:
      return sql`true`;
  }
}

function planBooleanColumn(column: SQL, condition: FilterCondition): SQL {
  const { operator, value } = condition;
  switch (operator) {
    case 'isTrue':
      return sql`${column} = TRUE`;
    case 'isFalse':
      return sql`${column} = FALSE`;
    case 'eq':
      if (value.kind !== 'boolean') return sql`false`;
      return sql`${column} = ${value.value}`;
    case 'neq':
      if (value.kind !== 'boolean') return sql`true`;
      return sql`${column} <> ${value.value}`;
    case 'isEmpty':
      return sql`${column} IS NULL`;
    case 'isNotEmpty':
      return sql`${column} IS NOT NULL`;
    default:
      return sql`true`;
  }
}

function planFolderId(condition: FilterCondition): SQL {
  const { operator, value } = condition;
  switch (operator) {
    case 'isEmpty':
      return sql`${notes.folderId} IS NULL`;
    case 'isNotEmpty':
      return sql`${notes.folderId} IS NOT NULL`;
    case 'eq':
      if (value.kind !== 'string') return sql`false`;
      return sql`${notes.folderId} = ${value.value}`;
    case 'neq':
      if (value.kind !== 'string') return sql`true`;
      return sql`(${notes.folderId} <> ${value.value} OR ${notes.folderId} IS NULL)`;
    case 'inAny':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return sql`${notes.folderId} = ANY(${textArray(value.values)})`;
    case 'notIn':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`true`;
      return sql`${notes.folderId} <> ALL(${textArray(value.values)}) OR ${notes.folderId} IS NULL`;
    default:
      return sql`true`;
  }
}

function planTagsColumn(condition: FilterCondition): SQL {
  const { operator, value } = condition;
  switch (operator) {
    case 'isEmpty':
      return sql`(${notes.tags} IS NULL OR jsonb_typeof(${notes.tags}) <> 'array' OR jsonb_array_length(${notes.tags}) = 0)`;
    case 'isNotEmpty':
      return sql`(${notes.tags} IS NOT NULL AND jsonb_typeof(${notes.tags}) = 'array' AND jsonb_array_length(${notes.tags}) > 0)`;
    case 'inAny':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return sql`jsonb_typeof(${notes.tags}) = 'array' AND ${notes.tags} ?| ${textArray(value.values)}`;
    case 'inAll':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return sql`jsonb_typeof(${notes.tags}) = 'array' AND ${notes.tags} @> ${jsonbStringArray(value.values)}`;
    case 'notIn':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`true`;
      return sql`NOT (jsonb_typeof(${notes.tags}) = 'array' AND ${notes.tags} ?| ${textArray(value.values)})`;
    default:
      return sql`true`;
  }
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Walk a node tree and collect every property `key` referenced by a
 * `property`-flavoured field so the caller can pre-fetch the matching
 * `PropertyDefinitionRow`s in one round trip before invoking
 * `planFilter`.
 */
export function collectPropertyKeys(node: FilterNode): string[] {
  const out = new Set<string>();
  visit(node, (cond) => {
    if (cond.field.kind === 'property') out.add(cond.field.key);
  });
  return Array.from(out);
}

/**
 * Walk a node tree and collect every `graphMetric` id referenced anywhere
 * — useful for callers that want to know up-front whether a request needs
 * the metric post-pass at all.
 */
export function collectGraphMetricIds(node: FilterNode): GraphMetricId[] {
  const out = new Set<GraphMetricId>();
  visit(node, (cond) => {
    if (cond.field.kind === 'graphMetric') out.add(cond.field.id);
  });
  return Array.from(out);
}

function visit(node: FilterNode, fn: (c: FilterCondition) => void): void {
  if (isFilterCondition(node)) fn(node);
  else if (isFilterGroup(node)) for (const child of node.children) visit(child, fn);
}

/** Internal use — re-exported for the planner's tests. */
export const _internals = { planTextColumn, planBooleanColumn, planTagsColumn };
// Reference unused FieldRef import to keep tree-shaking happy without an
// extra ts-expect-error pragma.
void (null as FieldRef | null);
