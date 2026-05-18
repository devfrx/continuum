/**
 * Predicate builders for filtering by a custom property value.
 *
 * For every `PropertyType` we know which column on `property_values` holds
 * the data, and from there we know the right SQL shape for each operator
 * (`=`, `ILIKE`, jsonb containment…). This module owns that mapping.
 *
 * The output is always a Drizzle `SQL` fragment that evaluates to boolean
 * in the context of an outer query on `notes`. For stored property types
 * the predicate is wrapped in `EXISTS (SELECT 1 FROM property_values pv
 * WHERE pv.note_id = notes.id AND pv.property_id IN (...) AND <typed>)`
 * so it can be AND-ed straight into the notes `WHERE`.
 *
 * The `IN (...)` form (rather than `= $id`) is what makes the per-note
 * property model work: a single logical property — addressed by `key` in
 * the filter UI — may be backed by many `property_definitions` rows
 * (one per note that owns the property, plus optional kind/global
 * Templates). The planner resolves the key to all matching definition
 * ids and passes them as an array; `EXISTS` over `property_id IN (ids)`
 * then treats the property as a single field even though storage is
 * sharded across many definition rows. `IS EMPTY` / `NEQ` / `NOT IN`
 * remain semantically correct because `NOT EXISTS` over the same set
 * means "no row across any of those definitions".
 *
 * Two property types are special-cased:
 *
 *  – `createdTime` / `lastEditedTime` are auto-managed and live on the
 *    `notes` table itself, not in `property_values`. We map them to
 *    `notes.createdAt` / `notes.updatedAt` directly so date filters on
 *    them work without a join.
 *  – Other computed types (`formula`, `rollup`, `button`, `createdBy`,
 *    `lastEditedBy`) have no SQL-cheap predicate. We return `sql\`true\``
 *    so the planner can still emit them as harmless no-ops; meaningful
 *    filtering on those would have to happen in JS.
 *
 * All user values flow through Drizzle's `sql` tag — never string
 * concatenation — so injection is impossible.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { PropertyType } from '@continuum/shared';
import {
  notes,
  propertyValues,
  type PropertyDefinitionRow,
} from '../../db/schema.js';
import type { FilterCondition } from '@continuum/shared';
import { validateOperatorValue } from './operator-registry.js';
import { jsonbStringArray, textArray } from './sql-values.js';

/** Minimal definition shape the builders need. */
export interface PropertyDefRef {
  id: string;
  type: PropertyType;
  config?: unknown;
}

/** Coerce a row or stub into the `{id, type}` shape expected internally. */
function asRef(def: PropertyDefRef | PropertyDefinitionRow): PropertyDefRef {
  return { id: def.id, type: def.type as PropertyType, config: def.config };
}

/**
 * Render `pv.property_id IN ($1, $2, …)` with each id parameterised so
 * Drizzle's value-binding (and the underlying postgres driver) handle
 * UUID escaping. The caller guarantees `ids` is non-empty.
 */
function inIds(ids: readonly string[]): SQL {
  return sql`pv.property_id IN (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

/**
 * Wrap a typed inner predicate in the canonical `EXISTS` shape so it can
 * be ANDed into a `notes` query. The inner fragment is evaluated against
 * the `pv` alias and may reference `pv.value_text` / `pv.value_number` /
 * `pv.value_bool` / `pv.value_date` / `pv.value_json` directly.
 */
function existsRow(propertyIds: readonly string[], inner: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM ${propertyValues} pv WHERE pv.note_id = ${notes.id} AND ${inIds(propertyIds)} AND ${inner})`;
}

/** Negation of `existsRow` — "no row, or no row matching the inner test". */
function notExistsRow(propertyIds: readonly string[], inner: SQL): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM ${propertyValues} pv WHERE pv.note_id = ${notes.id} AND ${inIds(propertyIds)} AND ${inner})`;
}

/** "Row missing or its typed column is null" — used for `isEmpty`. */
function isEmptyOnColumn(
  propertyIds: readonly string[],
  column: 'value_text' | 'value_number' | 'value_bool' | 'value_date' | 'value_json',
): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM ${propertyValues} pv WHERE pv.note_id = ${notes.id} AND ${inIds(propertyIds)} AND pv.${sql.raw(column)} IS NOT NULL)`;
}

function isNotEmptyOnColumn(
  propertyIds: readonly string[],
  column: 'value_text' | 'value_number' | 'value_bool' | 'value_date' | 'value_json',
): SQL {
  return sql`EXISTS (SELECT 1 FROM ${propertyValues} pv WHERE pv.note_id = ${notes.id} AND ${inIds(propertyIds)} AND pv.${sql.raw(column)} IS NOT NULL)`;
}

function isEmptyText(propertyIds: readonly string[]): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM ${propertyValues} pv WHERE pv.note_id = ${notes.id} AND ${inIds(propertyIds)} AND pv.value_text IS NOT NULL AND pv.value_text <> '')`;
}

function isNotEmptyText(propertyIds: readonly string[]): SQL {
  return existsRow(propertyIds, sql`pv.value_text IS NOT NULL AND pv.value_text <> ''`);
}

function isEmptyJsonArray(propertyIds: readonly string[]): SQL {
  return sql`(${isEmptyOnColumn(propertyIds, 'value_json')}) OR EXISTS (SELECT 1 FROM ${propertyValues} pv WHERE pv.note_id = ${notes.id} AND ${inIds(propertyIds)} AND (jsonb_typeof(pv.value_json) <> 'array' OR jsonb_array_length(pv.value_json) = 0))`;
}

function isNotEmptyJsonArray(propertyIds: readonly string[]): SQL {
  return existsRow(propertyIds, sql`jsonb_typeof(pv.value_json) = 'array' AND jsonb_array_length(pv.value_json) > 0`);
}

function jsonArrayHasAny(values: readonly string[]): SQL {
  return sql`jsonb_typeof(pv.value_json) = 'array' AND pv.value_json ?| ${textArray(values)}`;
}

function jsonArrayHasAll(values: readonly string[]): SQL {
  return sql`jsonb_typeof(pv.value_json) = 'array' AND pv.value_json @> ${jsonbStringArray(values)}`;
}

// ────────────────────── per-column-shape helpers ──────────────────────

function buildTextPredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isEmpty':
      return isEmptyText(propertyIds);
    case 'isNotEmpty':
      return isNotEmptyText(propertyIds);
    case 'eq':
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_text = ${value.value}`);
    case 'neq':
      if (value.kind !== 'string') return sql`true`;
      return notExistsRow(propertyIds, sql`pv.value_text = ${value.value}`);
    case 'contains':
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_text ILIKE ${'%' + escapeLike(value.value) + '%'}`);
    case 'notContains':
      if (value.kind !== 'string') return sql`true`;
      return notExistsRow(propertyIds, sql`pv.value_text ILIKE ${'%' + escapeLike(value.value) + '%'}`);
    case 'startsWith':
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_text ILIKE ${escapeLike(value.value) + '%'}`);
    case 'endsWith':
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_text ILIKE ${'%' + escapeLike(value.value)}`);
    case 'inAny':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return existsRow(propertyIds, sql`pv.value_text = ANY(${textArray(value.values)})`);
    case 'notIn':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`true`;
      return notExistsRow(propertyIds, sql`pv.value_text = ANY(${textArray(value.values)})`);
    default:
      return sql`true`;
  }
}

function buildNumberPredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isEmpty':
      return isEmptyOnColumn(propertyIds, 'value_number');
    case 'isNotEmpty':
      return isNotEmptyOnColumn(propertyIds, 'value_number');
    case 'eq': {
      const eqNumber = numberFromValue(value);
      if (eqNumber === null) return sql`false`;
      return existsRow(propertyIds, sql`pv.value_number = ${eqNumber}`);
    }
    case 'neq': {
      const neqNumber = numberFromValue(value);
      if (neqNumber === null) return sql`true`;
      return notExistsRow(propertyIds, sql`pv.value_number = ${neqNumber}`);
    }
    case 'gt':
      if (value.kind !== 'number') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_number > ${value.value}`);
    case 'gte':
      if (value.kind !== 'number') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_number >= ${value.value}`);
    case 'lt':
      if (value.kind !== 'number') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_number < ${value.value}`);
    case 'lte':
      if (value.kind !== 'number') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_number <= ${value.value}`);
    case 'between':
      if (value.kind !== 'numberRange') return sql`false`;
      return existsRow(
        propertyIds,
        sql`pv.value_number BETWEEN ${value.from} AND ${value.to}`,
      );
    default:
      return sql`true`;
  }
}

function numberFromValue(value: FilterCondition['value']): number | null {
  if (value.kind === 'number' && Number.isFinite(value.value)) return value.value;
  if (value.kind !== 'string') return null;
  const parsed = Number(value.value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function buildUniqueIdPredicate(
  propertyIds: readonly string[],
  config: unknown,
  condition: FilterCondition,
): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  const display = uniqueIdDisplaySql(config);

  switch (operator) {
    case 'isEmpty':
      return isEmptyOnColumn(propertyIds, 'value_number');
    case 'isNotEmpty':
      return isNotEmptyOnColumn(propertyIds, 'value_number');
    case 'eq': {
      const sequence = uniqueIdSequenceFromValue(value);
      if (sequence !== null) {
        return existsRow(propertyIds, sql`pv.value_number = ${sequence}`);
      }
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, sql`${display} = ${value.value.trim()}`);
    }
    case 'neq': {
      const sequence = uniqueIdSequenceFromValue(value);
      if (sequence !== null) {
        return notExistsRow(propertyIds, sql`pv.value_number = ${sequence}`);
      }
      if (value.kind !== 'string') return sql`true`;
      return notExistsRow(propertyIds, sql`${display} = ${value.value.trim()}`);
    }
    case 'contains':
      if (value.kind !== 'string') return sql`false`;
      return existsRow(
        propertyIds,
        sql`${display} ILIKE ${'%' + escapeLike(value.value.trim()) + '%'}`,
      );
    default:
      return sql`true`;
  }
}

function uniqueIdSequenceFromValue(value: FilterCondition['value']): number | null {
  if (value.kind === 'number' && Number.isFinite(value.value)) return value.value;
  if (value.kind !== 'string') return null;

  const trimmed = value.value.trim();
  if (!trimmed) return null;
  const direct = Number(trimmed);
  if (Number.isFinite(direct)) return direct;

  const trailingDigits = trimmed.match(/(\d+)$/);
  if (!trailingDigits) return null;
  const parsed = Number(trailingDigits[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueIdDisplaySql(config: unknown): SQL {
  const prefix = uniqueIdPrefix(config);
  if (!prefix) return sql`pv.value_number::bigint::text`;
  return sql`${prefix + '-'} || pv.value_number::bigint::text`;
}

function uniqueIdPrefix(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const prefix = (config as { prefix?: unknown }).prefix;
  return typeof prefix === 'string' ? prefix.trim() : '';
}

function buildBooleanPredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isTrue':
      return existsRow(propertyIds, sql`pv.value_bool = TRUE`);
    case 'isFalse':
      // "is false" includes the unset row (no row at all). Notion semantics.
      return notExistsRow(propertyIds, sql`pv.value_bool = TRUE`);
    case 'isEmpty':
      return isEmptyOnColumn(propertyIds, 'value_bool');
    case 'isNotEmpty':
      return isNotEmptyOnColumn(propertyIds, 'value_bool');
    case 'eq':
      if (value.kind !== 'boolean') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_bool = ${value.value}`);
    case 'neq':
      if (value.kind !== 'boolean') return sql`true`;
      return notExistsRow(propertyIds, sql`pv.value_bool = ${value.value}`);
    default:
      return sql`true`;
  }
}

function buildDatePredicate(
  propertyIds: readonly string[],
  condition: FilterCondition,
  now: Date,
): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  return buildDateOnColumn(sql`pv.value_date`, operator, value, now, propertyIds, true);
}

/**
 * Compile a date-flavoured operator against an arbitrary timestamp column
 * expression. Used both for `pv.value_date` (custom date properties) and
 * for `notes.created_at` / `notes.updated_at` (auto-managed property types
 * and system fields).
 *
 * `propertyIds === null` signals "no `property_values` join" (system
 * date columns) and short-circuits the wrapping logic.
 */
export function buildDateOnColumn(
  column: SQL,
  operator: FilterCondition['operator'],
  value: FilterCondition['value'],
  now: Date,
  propertyIds: readonly string[] | null,
  wrapInExists: boolean,
): SQL {
  const wrap = (inner: SQL): SQL =>
    wrapInExists && propertyIds && propertyIds.length > 0
      ? existsRow(propertyIds, inner)
      : inner;
  const wrapNot = (inner: SQL): SQL =>
    wrapInExists && propertyIds && propertyIds.length > 0
      ? notExistsRow(propertyIds, inner)
      : sql`NOT (${inner})`;

  switch (operator) {
    case 'isEmpty':
      if (!wrapInExists || !propertyIds || propertyIds.length === 0) return sql`${column} IS NULL`;
      return isEmptyOnColumn(propertyIds, 'value_date');
    case 'isNotEmpty':
      if (!wrapInExists || !propertyIds || propertyIds.length === 0) return sql`${column} IS NOT NULL`;
      return isNotEmptyOnColumn(propertyIds, 'value_date');
    case 'eq': {
      const eqDate = dateStringFromValue(value);
      if (!eqDate) return sql`false`;
      return wrap(sql`${column}::date = ${eqDate}::date`);
    }
    case 'neq': {
      const neqDate = dateStringFromValue(value);
      if (!neqDate) return sql`true`;
      return wrapNot(sql`${column}::date = ${neqDate}::date`);
    }
    case 'before':
      if (value.kind !== 'date') return sql`false`;
      return wrap(sql`${column} < ${value.value}::timestamptz`);
    case 'after':
      if (value.kind !== 'date') return sql`false`;
      return wrap(sql`${column} > ${value.value}::timestamptz`);
    case 'onOrBefore':
      if (value.kind !== 'date') return sql`false`;
      return wrap(sql`${column} <= ${value.value}::timestamptz`);
    case 'onOrAfter':
      if (value.kind !== 'date') return sql`false`;
      return wrap(sql`${column} >= ${value.value}::timestamptz`);
    case 'inRange':
      if (value.kind !== 'dateRange') return sql`false`;
      return wrap(
        sql`${column} BETWEEN ${value.from}::timestamptz AND ${value.to}::timestamptz`,
      );
    case 'today': {
      const start = startOfDay(now);
      const end = addDays(start, 1);
      return wrap(sql`${column} >= ${start.toISOString()}::timestamptz AND ${column} < ${end.toISOString()}::timestamptz`);
    }
    case 'thisWeek': {
      const start = startOfWeek(now);
      const end = addDays(start, 7);
      return wrap(sql`${column} >= ${start.toISOString()}::timestamptz AND ${column} < ${end.toISOString()}::timestamptz`);
    }
    case 'thisMonth': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      return wrap(sql`${column} >= ${start.toISOString()}::timestamptz AND ${column} < ${end.toISOString()}::timestamptz`);
    }
    case 'thisYear': {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
      return wrap(sql`${column} >= ${start.toISOString()}::timestamptz AND ${column} < ${end.toISOString()}::timestamptz`);
    }
    case 'lastNDays': {
      if (value.kind !== 'duration') return sql`false`;
      const start = addDays(startOfDay(now), -value.days);
      const end = addDays(startOfDay(now), 1);
      return wrap(sql`${column} >= ${start.toISOString()}::timestamptz AND ${column} < ${end.toISOString()}::timestamptz`);
    }
    case 'nextNDays': {
      if (value.kind !== 'duration') return sql`false`;
      const start = startOfDay(now);
      const end = addDays(start, value.days + 1);
      return wrap(sql`${column} >= ${start.toISOString()}::timestamptz AND ${column} < ${end.toISOString()}::timestamptz`);
    }
    default:
      return sql`true`;
  }
}

function dateStringFromValue(value: FilterCondition['value']): string | null {
  if (value.kind !== 'date' && value.kind !== 'string') return null;
  const trimmed = value.value.trim();
  return trimmed ? trimmed : null;
}

function buildDateRangePredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isEmpty':
      return isEmptyOnColumn(propertyIds, 'value_json');
    case 'isNotEmpty':
      return isNotEmptyOnColumn(propertyIds, 'value_json');
    case 'inRange':
      if (value.kind !== 'dateRange') return sql`false`;
      return existsRow(
        propertyIds,
        sql`(pv.value_json->>'from') <= ${value.to} AND (pv.value_json->>'to') >= ${value.from}`,
      );
    default:
      return sql`true`;
  }
}

function buildJsonArrayPredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isEmpty':
      // Either no row or an empty array.
      return isEmptyJsonArray(propertyIds);
    case 'isNotEmpty':
      return isNotEmptyJsonArray(propertyIds);
    case 'inAny':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return existsRow(propertyIds, jsonArrayHasAny(value.values));
    case 'inAll':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return existsRow(propertyIds, jsonArrayHasAll(value.values));
    case 'notIn':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`true`;
      return notExistsRow(propertyIds, jsonArrayHasAny(value.values));
    case 'eq':
      // Multi-select "equals" — a single-element array containing the value.
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, jsonArrayHasAll([value.value]));
    case 'neq':
      if (value.kind !== 'string') return sql`true`;
      return notExistsRow(propertyIds, jsonArrayHasAll([value.value]));
    default:
      return sql`true`;
  }
}

function buildVerificationPredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isEmpty':
      return isEmptyOnColumn(propertyIds, 'value_json');
    case 'isNotEmpty':
      return isNotEmptyOnColumn(propertyIds, 'value_json');
    case 'eq':
      if (value.kind !== 'string') return sql`false`;
      return existsRow(propertyIds, sql`pv.value_json->>'state' = ${value.value}`);
    case 'neq':
      if (value.kind !== 'string') return sql`true`;
      return notExistsRow(propertyIds, sql`pv.value_json->>'state' = ${value.value}`);
    case 'inAny':
      if (value.kind !== 'stringList' || value.values.length === 0) return sql`false`;
      return existsRow(propertyIds, sql`pv.value_json->>'state' = ANY(${textArray(value.values)})`);
    default:
      return sql`true`;
  }
}

function buildFilesPredicate(propertyIds: readonly string[], condition: FilterCondition): SQL {
  const { operator, value } = condition;
  validateOperatorValue(operator, value);
  switch (operator) {
    case 'isEmpty':
      return isEmptyJsonArray(propertyIds);
    case 'isNotEmpty':
      return isNotEmptyJsonArray(propertyIds);
    default:
      return sql`true`;
  }
}

// ───────────────────────────── public API ─────────────────────────────

/**
 * Build a SQL boolean expression that evaluates true for `notes` rows
 * which satisfy the supplied condition against the supplied set of
 * property definitions (all sharing the same `key`, hence the same
 * `type`).
 *
 * The array form lets the planner treat per-note property definitions as
 * a single field: pass every definition row whose `key` matches the
 * `FieldRef.key`, and the generated SQL evaluates the condition over
 * the union of their `property_values` rows.
 *
 * Returns `sql\`true\`` for property types we can't filter at the SQL
 * layer (formula, rollup, button, createdBy, lastEditedBy) — the planner
 * is expected to either accept the over-approximation or push such
 * conditions into the JS post-pass. Also returns `sql\`true\`` for an
 * empty `defs` array (the field reference resolved to nothing) so a
 * stale saved filter doesn't inadvertently exclude every note.
 *
 * @param defs      Definitions sharing the same `key` (must be non-empty
 *                  for stored types; for `createdTime`/`lastEditedTime`
 *                  the array is ignored and the system column is used).
 * @param condition The user-supplied filter condition.
 * @param now       Reference time used for relative date operators
 *                  (`today`, `lastNDays`…). Pass the request timestamp.
 */
export function buildPropertyConditionSQL(
  defs: ReadonlyArray<PropertyDefRef | PropertyDefinitionRow>,
  condition: FilterCondition,
  now: Date = new Date(),
): SQL {
  if (defs.length === 0) return sql`true`;
  const refs = defs.map(asRef);
  const ids = refs.map((r) => r.id);
  const type = refs[0].type;
  const config = refs[0].config;
  switch (type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
      return buildTextPredicate(ids, condition);
    case 'number':
    case 'progress':
      return buildNumberPredicate(ids, condition);
    case 'uniqueId':
      return buildUniqueIdPredicate(ids, config, condition);
    case 'checkbox':
      return buildBooleanPredicate(ids, condition);
    case 'date':
      return buildDatePredicate(ids, condition, now);
    case 'dateRange':
      return buildDateRangePredicate(ids, condition);
    case 'multiSelect':
    case 'relation':
      return buildJsonArrayPredicate(ids, condition);
    case 'verification':
      return buildVerificationPredicate(ids, condition);
    case 'files':
      return buildFilesPredicate(ids, condition);
    case 'createdTime':
      return buildDateOnColumn(
        sql`${notes.createdAt}`,
        condition.operator,
        condition.value,
        now,
        null,
        false,
      );
    case 'lastEditedTime':
      return buildDateOnColumn(
        sql`${notes.updatedAt}`,
        condition.operator,
        condition.value,
        now,
        null,
        false,
      );
    case 'formula':
    case 'rollup':
    case 'button':
    case 'createdBy':
    case 'lastEditedBy':
      // Not SQL-cheap. Returns true so the planner produces a harmless
      // no-op; meaningful filtering on these would be a JS post-pass.
      return sql`true`;
  }
}

/** Escape `%` and `_` so an arbitrary user value can be used inside `ILIKE`. */
function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

/** ISO week — Monday as first day, mirrors the web app's date pickers. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const dow = day.getUTCDay(); // 0=Sun, 1=Mon, …
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(day, offset);
}
