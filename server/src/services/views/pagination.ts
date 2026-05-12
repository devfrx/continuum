/**
 * Cursor pagination for view queries.
 *
 * The cursor is an opaque base64-encoded JSON payload of the form
 * `{ id, sortKeys }`, where `sortKeys` are the values of the user-defined
 * sort columns for the last row of the previous page. The id is always
 * the trailing tie-breaker.
 *
 * Building the WHERE predicate uses the standard "OR-of-prefixes" pattern
 * for keyset pagination, which works for arbitrary mixes of ASC/DESC
 * directions:
 *
 *   (k1 cmp1 v1)
 *   OR (k1 = v1 AND k2 cmp2 v2)
 *   OR (k1 = v1 AND k2 = v2 AND id > cursorId)
 *
 * NULL handling note: `>` / `<` against `NULL` always return UNKNOWN, so
 * rows where a sort key is `NULL` and the cursor value is `NULL` may be
 * skipped. This matches the behaviour of common keyset implementations
 * and is acceptable for M2; tightening it via `IS [NOT] DISTINCT FROM`
 * is tracked as a TODO M6+.
 */

import { sql, type SQL } from 'drizzle-orm';
import type { SortRule } from '@continuum/shared';
import type { SortKeyExpr } from './sort-compiler.js';

/** Opaque cursor payload. */
interface CursorPayload {
  id: string;
  sortKeys: (string | number | boolean | null)[];
}

/**
 * Encode a cursor for the given row.
 *
 * @param id        The row's note id (trailing tie-breaker).
 * @param sortKeys  Raw values of each sort key, in the order of `SortRule[]`.
 */
export function encodeCursor(
  id: string,
  sortKeys: (string | number | boolean | Date | null)[],
): string {
  const payload: CursorPayload = {
    id,
    sortKeys: sortKeys.map(normaliseForCursor),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decode a cursor and validate its shape against the current sort rules.
 *
 * @throws Error('cursor-malformed') when the payload cannot be parsed or
 *   its `sortKeys` length does not match `sortRules`.
 */
export function decodeCursor(
  cursor: string | null | undefined,
  sortRules: SortRule[],
): CursorPayload | null {
  if (cursor == null || cursor === '') return null;
  let json: string;
  try {
    json = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new Error('cursor-malformed');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('cursor-malformed');
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { id?: unknown }).id !== 'string' ||
    !Array.isArray((parsed as { sortKeys?: unknown }).sortKeys)
  ) {
    throw new Error('cursor-malformed');
  }
  const sortKeys = (parsed as CursorPayload).sortKeys;
  if (sortKeys.length !== sortRules.length) {
    throw new Error('cursor-malformed');
  }
  return { id: (parsed as CursorPayload).id, sortKeys };
}

/**
 * Build the WHERE-predicate fragment that excludes everything up to and
 * including the cursor row. Returns `undefined` when no cursor is present.
 */
export function buildCursorPredicate(
  cursor: CursorPayload | null,
  keyExprs: SortKeyExpr[],
): SQL | undefined {
  if (!cursor) return undefined;

  // No user sort keys → only the id tie-breaker matters.
  if (keyExprs.length === 0) {
    return sql`n.id > ${cursor.id}`;
  }

  // OR-of-prefixes. For each prefix length p in [0, keyExprs.length]:
  //  - Equality on the first p keys (using IS NOT DISTINCT FROM for null-safety).
  //  - For p < keyExprs.length: comparator on key p.
  //  - For p = keyExprs.length: id > cursorId tie-breaker.
  const clauses: SQL[] = [];
  for (let p = 0; p <= keyExprs.length; p++) {
    const parts: SQL[] = [];
    for (let i = 0; i < p; i++) {
      const eqVal = coerceForCompare(cursor.sortKeys[i], keyExprs[i]);
      parts.push(sql`${keyExprs[i].expr} IS NOT DISTINCT FROM ${eqVal}`);
    }
    if (p < keyExprs.length) {
      const k = keyExprs[p];
      const op = k.direction === 'desc' ? sql.raw('<') : sql.raw('>');
      const cmpVal = coerceForCompare(cursor.sortKeys[p], k);
      parts.push(sql`${k.expr} ${op} ${cmpVal}`);
    } else {
      parts.push(sql`n.id > ${cursor.id}`);
    }
    clauses.push(sql`(${sql.join(parts, sql` AND `)})`);
  }
  return sql`(${sql.join(clauses, sql` OR `)})`;
}

/** Coerce a raw cell value into something JSON-safe for the cursor blob. */
function normaliseForCursor(
  value: string | number | boolean | Date | null,
): string | number | boolean | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * Coerce a cursor-decoded value back to a driver-native type for SQL
 * comparison. Specifically, ISO strings stored for `date`-typed keys are
 * rebuilt into `Date` so the postgres-js driver binds them as
 * `timestamptz` instead of `text`.
 */
function coerceForCompare(
  raw: string | number | boolean | null,
  key: SortKeyExpr,
): unknown {
  if (raw === null) return null;
  if (key.type === 'date' || key.type === 'dateRange') {
    if (typeof raw === 'string') return new Date(raw);
  }
  return raw;
}
