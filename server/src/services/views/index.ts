/**
 * Database View query engine — public entry point.
 *
 * Pipeline (per request):
 *   1. Load the kind's `propertyDefinitions` (used by filter + sort compilers).
 *   2. Compile the filter tree → optional `WHERE` fragment.
 *   3. Compile the sort rules → joins + ORDER BY items + sort-key expressions.
 *   4. Decode the cursor (if any) → optional cursor predicate.
 *   5. Run a `COUNT(*)` for `total` (filter-only, no cursor / sort).
 *   6. Run the paged id query (`LIMIT pageSize + 1` to detect overflow).
 *   7. Project the page via `projectRows` (note row + resolved properties).
 *   8. (M6) In parallel: footer calculations and group buckets, both
 *      scoped by the same composite filter so totals stay consistent.
 */

import { sql, asc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { propertyDefinitions, type PropertyDefinitionRow } from '../../db/schema.js';
import {
  QUERY_PAGE_SIZE_DEFAULT,
  QUERY_PAGE_SIZE_MAX,
  type CalcFnResult,
  type DatabaseViewConfig,
  type QueryGroupBucket,
  type QueryResponse,
} from '@continuum/shared';
import { compileFilter } from './filter-compiler.js';
import { compileSort, type SortKeyExpr } from './sort-compiler.js';
import {
  buildCursorPredicate,
  decodeCursor,
  encodeCursor,
} from './pagination.js';
import { projectRows } from './projection.js';
import { runCalculations } from './calculation-engine.js';
import { buildGroups } from './group-engine.js';

/** Options accepted by {@link runViewQuery}. */
export interface RunViewQueryOptions {
  cursor?: string | null;
  pageSize?: number;
}

/**
 * Execute a Database View query and return one page of results plus the
 * total row count. The `view` argument carries (at minimum) the
 * {@link DatabaseViewConfig} that drives filtering, sorting and paging.
 */
export async function runViewQuery(
  kindId: string,
  view: { config: DatabaseViewConfig },
  opts: RunViewQueryOptions = {},
): Promise<QueryResponse> {
  const config = view.config;
  const pageSize = clampPageSize(opts.pageSize);

  // 1. Load definitions for this kind (drives filter + sort compilation).
  const defs = await db
    .select()
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.kindId, kindId))
    .orderBy(asc(propertyDefinitions.position));

  // 2-3. Compile filter, sort.
  const filterSql = compileFilter(defs, config.filter);
  const searchSql = compileSearch(config.search);
  const baseFilter = combine(filterSql, searchSql);
  const compiledSort = compileSort(config.sort, defs);

  // 4. Decode cursor (throws 'cursor-malformed' on bad input).
  const cursor = decodeCursor(opts.cursor, config.sort);
  const cursorPredicate = buildCursorPredicate(cursor, compiledSort.keyExprs);

  // 5. Total count (filter only — cursor and sort do not affect totals).
  const total = await fetchTotal(kindId, baseFilter);

  // 6. Paged id fetch.
  const pageRows = await fetchPageIds({
    kindId,
    baseFilter,
    cursorPredicate,
    joins: compiledSort.joins,
    orderBy: compiledSort.orderBy,
    keyExprs: compiledSort.keyExprs,
    limit: pageSize + 1,
  });

  let nextCursor: string | null = null;
  let pageIds: string[] = pageRows.map((r) => r.id);
  if (pageRows.length > pageSize) {
    pageRows.pop();
    pageIds = pageRows.map((r) => r.id);
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeCursor(last.id, last.sortKeys);
  }

  // 7. Project rows.
  const rows = await projectRows(pageIds);

  // 8. Footer calcs + group buckets (parallel, both filter-scoped).
  const [calc, groups] = await Promise.all([
    runCalcs(kindId, defs, config, baseFilter),
    runGroups(kindId, defs, config, baseFilter),
  ]);

  return {
    rows,
    nextCursor,
    total,
    calc,
    groups,
  };
}

// ───────────────────────── Helpers ─────────────────────────

/** Run footer calculations only when the view actually requests at least one. */
async function runCalcs(
  kindId: string,
  defs: PropertyDefinitionRow[],
  config: DatabaseViewConfig,
  filterSql: ReturnType<typeof compileFilter>,
): Promise<Record<string, CalcFnResult>> {
  const entries = Object.entries(config.calculation);
  if (!entries.some(([, c]) => c.fn !== 'none')) return {};
  return runCalculations({ kindId, defs, calc: config.calculation, filterSql });
}

/** Compute group buckets only when the view config asks for grouping. */
async function runGroups(
  kindId: string,
  defs: PropertyDefinitionRow[],
  config: DatabaseViewConfig,
  filterSql: ReturnType<typeof compileFilter>,
): Promise<QueryGroupBucket[] | undefined> {
  if (!config.group) return undefined;
  return buildGroups({ kindId, defs, group: config.group, filterSql });
}

function clampPageSize(requested: number | undefined): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return QUERY_PAGE_SIZE_DEFAULT;
  }
  return Math.max(1, Math.min(QUERY_PAGE_SIZE_MAX, Math.trunc(requested)));
}

/** Combine two optional SQL fragments with `AND`. */
function combine(a: ReturnType<typeof compileFilter>, b: ReturnType<typeof compileFilter>) {
  if (a && b) return sql`(${a}) AND (${b})`;
  return a ?? b;
}

/** Build the `title ILIKE %search%` fragment, when search is non-empty. */
function compileSearch(search: string | null | undefined) {
  if (!search || search.trim() === '') return undefined;
  const needle = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`n.title ILIKE ${needle}`;
}

/** Fetch the total count of notes matching `kind` + filter (no sort/cursor). */
async function fetchTotal(
  kindId: string,
  baseFilter: ReturnType<typeof compileFilter>,
): Promise<number> {
  const where = baseFilter
    ? sql`n.kind = ${kindId} AND ${baseFilter}`
    : sql`n.kind = ${kindId}`;
  const result = (await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM notes n WHERE ${where}`,
  )) as unknown as Array<{ count: number }>;
  return result[0]?.count ?? 0;
}

/** Internal paged-id query parameters. */
interface FetchPageIdsArgs {
  kindId: string;
  baseFilter: ReturnType<typeof compileFilter>;
  cursorPredicate: ReturnType<typeof buildCursorPredicate>;
  joins: ReturnType<typeof compileSort>['joins'];
  orderBy: ReturnType<typeof compileSort>['orderBy'];
  keyExprs: SortKeyExpr[];
  limit: number;
}

/** One row of the paged-id query — id + the raw sort-key values for cursor encoding. */
interface PageIdRow {
  id: string;
  sortKeys: (string | number | boolean | Date | null)[];
}

/**
 * Run the paged id query. We `SELECT n.id` plus one column per sort key
 * (aliased `k0`, `k1`, …) so we can encode the next cursor without a
 * follow-up round-trip.
 */
async function fetchPageIds(args: FetchPageIdsArgs): Promise<PageIdRow[]> {
  const { kindId, baseFilter, cursorPredicate, joins, orderBy, keyExprs, limit } = args;

  const whereParts = [sql`n.kind = ${kindId}`];
  if (baseFilter) whereParts.push(baseFilter);
  if (cursorPredicate) whereParts.push(cursorPredicate);
  const where = sql.join(whereParts, sql` AND `);

  const select = sql.join(
    [
      sql`n.id AS id`,
      ...keyExprs.map((k, i) => sql`${k.expr} AS ${sql.raw(`k${i}`)}`),
    ],
    sql`, `,
  );

  const joinClause =
    joins.length === 0 ? sql.raw('') : sql.join(joins, sql` `);

  const query = sql`SELECT ${select} FROM notes n ${joinClause} WHERE ${where} ORDER BY ${sql.join(orderBy, sql`, `)} LIMIT ${limit}`;

  const result = (await db.execute(query)) as unknown as Array<Record<string, unknown>>;
  return result.map((row) => ({
    id: String(row.id),
    sortKeys: keyExprs.map((_, i) => row[`k${i}`] as PageIdRow['sortKeys'][number]),
  }));
}

// Re-export internals that callers (tests, future engine consumers) may need.
export type { CompiledSort } from './sort-compiler.js';
export { encodeCursor, decodeCursor } from './pagination.js';
