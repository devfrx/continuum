/**
 * Sort compiler — convert {@link SortRule}[] into the SQL fragments needed
 * by the view-query pipeline:
 *
 *  1. A list of `LEFT JOIN property_values pv_<i> …` clauses, one per rule.
 *  2. A list of `ORDER BY` items in the same order, plus a final `n.id ASC`
 *     tie-breaker so cursor pagination is deterministic.
 *  3. A list of "key expressions" (e.g. `pv_0.value_text`) reused by the
 *     cursor predicate to build a tuple comparison.
 *
 * Computed property types (`formula`, `rollup`, `createdTime`, `createdBy`,
 * `lastEditedTime`, `lastEditedBy`, `button`, `uniqueId`) are not stored in
 * `property_values`, so sorting on them in M2 would yield all-NULL keys.
 * Such rules are skipped with a single warn-log per key (TODO M6+).
 */

import { sql, type SQL } from 'drizzle-orm';
import type { SortRule, PropertyType } from '@continuum/shared';
import type { PropertyDefinitionRow } from '../../db/schema.js';

/** A single sort key expression, retained for cursor-predicate building. */
export interface SortKeyExpr {
  /** SQL expression (e.g. `pv_0.value_text`) used in ORDER BY and cursor. */
  expr: SQL;
  /** Direction of this key in the ORDER BY. */
  direction: 'asc' | 'desc';
  /** Originating property type — drives JS-side cursor (de)serialisation. */
  type: PropertyType;
}

/** Result of {@link compileSort}. */
export interface CompiledSort {
  /** `LEFT JOIN` clauses, in the order they must appear in `FROM`. */
  joins: SQL[];
  /** `ORDER BY` items including the final `n.id ASC` tie-breaker. */
  orderBy: SQL[];
  /** Expressions backing the user-defined sort keys (no tie-breaker). */
  keyExprs: SortKeyExpr[];
}

/** Property types whose value is materialised at request time, not stored. */
const SKIP_TYPES = new Set<PropertyType>([
  'formula',
  'rollup',
  'createdTime',
  'createdBy',
  'lastEditedTime',
  'lastEditedBy',
  'button',
  'uniqueId',
]);

/**
 * Pick the sparse column to sort on for a given property type.
 * Returns `null` for JSON-stored types we do not yet sort on (multiSelect,
 * relation, files, dateRange, verification — TODO M6+).
 */
function sortColumnFor(type: PropertyType): 'value_text' | 'value_number' | 'value_bool' | 'value_date' | null {
  switch (type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
      return 'value_text';
    case 'number':
    case 'progress':
      return 'value_number';
    case 'checkbox':
      return 'value_bool';
    case 'date':
      return 'value_date';
    default:
      return null;
  }
}

/**
 * Compile a list of {@link SortRule} into joins + ORDER BY items.
 * The final ORDER BY always tails with `n.id ASC` to break ties.
 */
export function compileSort(
  rules: SortRule[],
  defs: PropertyDefinitionRow[],
): CompiledSort {
  const byKey = new Map(defs.map((d) => [d.key, d] as const));
  const joins: SQL[] = [];
  const orderBy: SQL[] = [];
  const keyExprs: SortKeyExpr[] = [];

  rules.forEach((rule, index) => {
    const def = byKey.get(rule.propertyKey);
    if (!def) {
      warnOnce(`unknown property key "${rule.propertyKey}" — sort rule dropped`);
      return;
    }
    const type = def.type as PropertyType;
    if (SKIP_TYPES.has(type)) {
      warnOnce(`property "${def.key}" of type "${type}" is computed — sort skipped (TODO M6+)`);
      return;
    }
    const column = sortColumnFor(type);
    if (!column) {
      warnOnce(`property "${def.key}" of type "${type}" not yet sortable (TODO M6+)`);
      return;
    }

    const alias = `pv_${index}`;
    const aliasSql = sql.raw(alias);
    // The alias is a server-generated literal (`pv_<i>`), so injecting it
    // via `sql.raw` is safe. The property id binds as a parameter.
    joins.push(
      sql`LEFT JOIN property_values ${aliasSql} ON ${aliasSql}.note_id = n.id AND ${aliasSql}.property_id = ${def.id}`,
    );

    const expr = sql.raw(`${alias}.${column}`);
    const direction = rule.direction;
    // Default Postgres null ordering already matches "ASC NULLS LAST,
    // DESC NULLS FIRST" — leave it implicit.
    orderBy.push(direction === 'desc' ? sql`${expr} DESC` : sql`${expr} ASC`);
    keyExprs.push({ expr, direction, type });
  });

  // Stable tie-breaker — required for deterministic cursor pagination.
  orderBy.push(sql`n.id ASC`);

  return { joins, orderBy, keyExprs };
}

const WARNED = new Set<string>();
function warnOnce(message: string): void {
  if (WARNED.has(message)) return;
  WARNED.add(message);
  console.warn(`[views/sort] ${message}`);
}
