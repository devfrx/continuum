/**
 * Calculation engine — compute footer-row aggregates for each column the
 * view requests. Maps `propertyKey → CalcFn` from `view.config.calculation`
 * into a `propertyKey → CalcFnResult` record returned alongside the page.
 *
 * Each calc resolves to a single SQL fragment scoped by the same composite
 * filter the page query uses, so the totals are consistent with the rows
 * the user sees. Per-property issuance is acceptable for v1 — the column
 * count is bounded (UI surface < 30) and each query is a tiny aggregate
 * over the indexed `property_values` table.
 */

import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import type { PropertyDefinitionRow } from '../../db/schema.js';
import type { CalcFn, CalcFnResult } from '@continuum/shared';

/** Inputs accepted by {@link runCalculations}. */
export interface RunCalcParams {
  defs: PropertyDefinitionRow[];
  /** Map of propertyKey → CalcFn from `view.config.calculation`. */
  calc: Record<string, CalcFn>;
  kindId: string;
  /** Same composite WHERE fragment the page query uses (no cursor). */
  filterSql: SQL | undefined;
}

/**
 * Run the configured calc for each column. Entries with `fn === 'none'`,
 * unknown property keys, or fn/type mismatches are skipped (warn-logged).
 */
export async function runCalculations(p: RunCalcParams): Promise<Record<string, CalcFnResult>> {
  const out: Record<string, CalcFnResult> = {};
  const byKey = new Map(p.defs.map((d) => [d.key, d] as const));
  const total = needsTotal(p.calc) ? await fetchTotal(p.kindId, p.filterSql) : 0;

  for (const [propertyKey, calc] of Object.entries(p.calc)) {
    if (calc.fn === 'none') continue;
    const def = byKey.get(propertyKey);
    if (!def) {
      warnOnce(`calc: unknown property "${propertyKey}" — skipped`);
      continue;
    }
    if (!isFnCompatible(calc, def.type)) {
      warnOnce(`calc: fn "${calc.fn}" not valid for type "${def.type}" — skipped`);
      continue;
    }
    out[propertyKey] = await runOne(calc, def, p.kindId, p.filterSql, total);
  }
  return out;
}

// ───────────────────────── Internals ─────────────────────────

/** Type compatibility tables for the {@link CalcFn} discriminator. */
const NUMERIC_TYPES = new Set(['number', 'progress']);
const DATE_TYPES = new Set(['date', 'dateRange', 'createdTime', 'lastEditedTime']);

/** True when at least one entry needs the total row count. */
function needsTotal(calc: Record<string, CalcFn>): boolean {
  const need = new Set(['count_all', 'count_empty', 'percent_empty', 'percent_not_empty', 'percent_checked', 'percent_unchecked']);
  for (const c of Object.values(calc)) if (need.has(c.fn)) return true;
  return false;
}

/** Validate that a calc's `kind` discriminator matches the column's type. */
function isFnCompatible(calc: CalcFn, type: string): boolean {
  switch (calc.kind) {
    case 'common': return true;
    case 'numeric': return NUMERIC_TYPES.has(type);
    case 'date': return DATE_TYPES.has(type);
    case 'checkbox': return type === 'checkbox';
  }
}

/**
 * Build the standard aggregate query: `SELECT <agg> AS v FROM notes n JOIN
 * property_values pv ON ... WHERE <kind+filter> [AND <extra>]`. Centralising
 * this shape keeps every calc branch a one-liner.
 */
function aggQuery(
  agg: SQL,
  propertyId: string,
  kindId: string,
  filterSql: SQL | undefined,
  extra?: SQL,
): SQL {
  const where = filterSql ? sql`n.kind = ${kindId} AND ${filterSql}` : sql`n.kind = ${kindId}`;
  const tail = extra ? sql` AND ${extra}` : sql.raw('');
  return sql`SELECT ${agg} AS v FROM notes n JOIN property_values pv ON pv.note_id = n.id AND pv.property_id = ${propertyId} WHERE ${where}${tail}`;
}

/** Pick the property-value column to count uniqueness over. */
function uniqueExpr(def: PropertyDefinitionRow): SQL {
  switch (def.type) {
    case 'number': case 'progress': return sql`pv.value_number`;
    case 'checkbox': return sql`pv.value_bool`;
    case 'date': return sql`pv.value_date`;
    case 'multiSelect': case 'relation': case 'dateRange': case 'verification':
      return sql`pv.value_json::text`;
    default: return sql`pv.value_text`;
  }
}

/** Run a single calc. Returns `null` when the aggregate has no rows. */
async function runOne(
  calc: CalcFn,
  def: PropertyDefinitionRow,
  kindId: string,
  filterSql: SQL | undefined,
  total: number,
): Promise<CalcFnResult> {
  const presence = sql`COUNT(*)::int`;
  switch (calc.fn) {
    /* count of every row matching the filter (ignores the property). */
    case 'count_all': return total;
    /* count of rows with a non-null value for this property. */
    case 'count_values': case 'count_not_empty':
      return await scalar(aggQuery(presence, def.id, kindId, filterSql));
    /* total minus presence count. */
    case 'count_empty': {
      const present = (await scalar(aggQuery(presence, def.id, kindId, filterSql))) as number;
      return total - present;
    }
    case 'percent_empty': {
      const present = (await scalar(aggQuery(presence, def.id, kindId, filterSql))) as number;
      return percent(total - present, total);
    }
    case 'percent_not_empty': {
      const present = (await scalar(aggQuery(presence, def.id, kindId, filterSql))) as number;
      return percent(present, total);
    }
    case 'count_unique':
      return await scalar(aggQuery(sql`COUNT(DISTINCT ${uniqueExpr(def)})::int`, def.id, kindId, filterSql));
    /* numeric aggregates over value_number. */
    case 'sum': return await scalar(aggQuery(sql`SUM(pv.value_number)::float8`, def.id, kindId, filterSql));
    case 'avg': return await scalar(aggQuery(sql`AVG(pv.value_number)::float8`, def.id, kindId, filterSql));
    case 'min': return await scalar(aggQuery(sql`MIN(pv.value_number)::float8`, def.id, kindId, filterSql));
    case 'max': return await scalar(aggQuery(sql`MAX(pv.value_number)::float8`, def.id, kindId, filterSql));
    case 'median':
      return await scalar(aggQuery(sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY pv.value_number)::float8`, def.id, kindId, filterSql));
    case 'range': {
      const lo = (await scalar(aggQuery(sql`MIN(pv.value_number)::float8`, def.id, kindId, filterSql))) as number | null;
      const hi = (await scalar(aggQuery(sql`MAX(pv.value_number)::float8`, def.id, kindId, filterSql))) as number | null;
      return lo === null || hi === null ? null : hi - lo;
    }
    /* date aggregates: ISO-date strings for earliest/latest, days for range. */
    case 'earliest': return await isoScalar(aggQuery(sql`MIN(pv.value_date)`, def.id, kindId, filterSql));
    case 'latest': return await isoScalar(aggQuery(sql`MAX(pv.value_date)`, def.id, kindId, filterSql));
    case 'date_range':
      return await scalar(aggQuery(sql`EXTRACT(EPOCH FROM (MAX(pv.value_date) - MIN(pv.value_date)))::float8 / 86400`, def.id, kindId, filterSql));
    /* checkbox bucket counts, optionally normalised against the total. */
    case 'checked': return await scalar(aggQuery(presence, def.id, kindId, filterSql, sql`pv.value_bool = TRUE`));
    case 'unchecked': return await scalar(aggQuery(presence, def.id, kindId, filterSql, sql`pv.value_bool = FALSE`));
    case 'percent_checked':
      return percent((await scalar(aggQuery(presence, def.id, kindId, filterSql, sql`pv.value_bool = TRUE`))) as number, total);
    case 'percent_unchecked':
      return percent((await scalar(aggQuery(presence, def.id, kindId, filterSql, sql`pv.value_bool = FALSE`))) as number, total);
    /* istanbul ignore next — exhaustive guard. */
    default: return null;
  }
}

// ───────── Result helpers ─────────

async function scalar(query: SQL): Promise<number | null> {
  const rows = (await db.execute(query)) as unknown as Array<{ v: number | null }>;
  const v = rows[0]?.v;
  return v === undefined || v === null ? null : v;
}

/** Variant of {@link scalar} that turns a Date into an ISO date string. */
async function isoScalar(query: SQL): Promise<string | null> {
  const rows = (await db.execute(query)) as unknown as Array<{ v: Date | string | null }>;
  const v = rows[0]?.v;
  if (v === undefined || v === null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Compute `(part / total) * 100` rounded to two decimals; `0` when total = 0. */
function percent(part: number, total: number): number {
  return total <= 0 ? 0 : Math.round((part / total) * 10000) / 100;
}

async function fetchTotal(kindId: string, filterSql: SQL | undefined): Promise<number> {
  const where = filterSql ? sql`n.kind = ${kindId} AND ${filterSql}` : sql`n.kind = ${kindId}`;
  const rows = (await db.execute(sql`SELECT COUNT(*)::int AS v FROM notes n WHERE ${where}`)) as unknown as Array<{ v: number }>;
  return rows[0]?.v ?? 0;
}

const WARNED = new Set<string>();
function warnOnce(message: string): void {
  if (WARNED.has(message)) return;
  WARNED.add(message);
  console.warn(`[views/calc] ${message}`);
}
