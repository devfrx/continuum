/**
 * Group engine — turn a {@link GroupConfig} into a list of
 * {@link QueryGroupBucket} entries for the current page's filter set.
 *
 * One aggregate query: `notes LEFT JOIN property_values` so every kind row
 * is considered and the empty bucket falls out as `bucket_key IS NULL`.
 * Multi-valued types (`multiSelect`, `relation`) expand via a
 * `LATERAL jsonb_array_elements_text(value_json)` so a single row appears
 * in every bucket it belongs to.
 *
 * Bucket-row hydration is out of scope (M6+): the response carries
 * `{ key, label, count }` only. A future `?groupKey=` request param will
 * lazy-load rows for a single bucket without re-running this aggregate.
 */

import { sql, inArray, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { notes, type PropertyDefinitionRow } from '../../db/schema.js';
import type { GroupConfig, QueryGroupBucket } from '@continuum/shared';

/** Inputs accepted by {@link buildGroups}. */
export interface BuildGroupsParams {
  kindId: string;
  defs: PropertyDefinitionRow[];
  group: GroupConfig;
  /** Same composite WHERE fragment the page query uses (no cursor). */
  filterSql: SQL | undefined;
}

/**
 * Compute the bucket list for a grouped view. Returns `[]` when the group
 * targets an unsupported / unknown property; in that case the caller should
 * surface no groups (`groups: undefined` upstream).
 */
export async function buildGroups(p: BuildGroupsParams): Promise<QueryGroupBucket[]> {
  const def = p.defs.find((d) => d.key === p.group.propertyKey);
  if (!def) {
    warnOnce(`group: unknown property "${p.group.propertyKey}" — no groups`);
    return [];
  }

  // person/createdBy/lastEditedBy aren't stored in property_values yet;
  // bucketing them needs a dedicated source (deferred to M6+).
  if (p.group.type === 'person') {
    warnOnce('group: type "person" not yet supported (no property_values storage)');
    return [];
  }
  if (p.group.type === 'status' && p.group.byPipelineGroup) warnOnce('group: status.byPipelineGroup not supported — using option id');
  if (p.group.type === 'date' && p.group.bucket === 'relative') warnOnce('group: date.bucket="relative" not supported — using "day"');

  const rows = await fetchBucketCounts(p.kindId, def.id, p.group, p.filterSql);
  const labels = await resolveLabels(p.group, def, rows.map((r) => r.key));
  let buckets: QueryGroupBucket[] = rows.map((r) => ({
    key: r.key,
    label: labels.get(r.key) ?? (r.key === null ? 'Empty' : r.key),
    count: r.count,
  }));
  if (p.group.hideEmpty) buckets = buckets.filter((b) => b.key !== null && b.count > 0);
  return sortBuckets(buckets, p.group);
}

// ───────────────────────── Internals ─────────────────────────

interface BucketRow {
  key: string | null;
  count: number;
}

/** Resolve the per-row bucket-key SQL expression for the given group config. */
function bucketExpr(group: GroupConfig): SQL {
  switch (group.type) {
    case 'select':
    case 'status':
      // Single-option types store the option id in `value_text`.
      return sql`pv.value_text`;
    case 'checkbox':
      // Cast to text so the outer GROUP BY produces stable string keys.
      return sql`CASE WHEN pv.value_bool IS TRUE THEN 'true' WHEN pv.value_bool IS FALSE THEN 'false' ELSE NULL END`;
    case 'date':
      return sql`to_char(pv.value_date, ${dateFormat(group.bucket)})`;
    case 'multiSelect':
    case 'relation':
      // Expanded via the LATERAL join in fetchBucketCounts; column alias is `elem`.
      return sql`elem`;
    /* istanbul ignore next — person is filtered out earlier. */
    default:
      return sql`NULL`;
  }
}

/** Map a {@link DateGroupBucket} to a Postgres `to_char` format string. */
function dateFormat(bucket: string): string {
  switch (bucket) {
    case 'day':
      return 'YYYY-MM-DD';
    case 'week':
      return 'IYYY-"W"IW';
    case 'month':
      return 'YYYY-MM';
    case 'quarter':
      return 'YYYY-"Q"Q';
    case 'year':
      return 'YYYY';
    /* relative: deferred — fall back to day granularity. */
    default:
      return 'YYYY-MM-DD';
  }
}

/** Run the aggregate query that produces `(key, count)` pairs. */
async function fetchBucketCounts(
  kindId: string,
  propertyId: string,
  group: GroupConfig,
  filterSql: SQL | undefined,
): Promise<BucketRow[]> {
  const where = filterSql
    ? sql`n.kind = ${kindId} AND ${filterSql}`
    : sql`n.kind = ${kindId}`;
  const join = sql`LEFT JOIN property_values pv ON pv.note_id = n.id AND pv.property_id = ${propertyId}`;
  const lateral =
    group.type === 'multiSelect' || group.type === 'relation'
      ? sql`LEFT JOIN LATERAL jsonb_array_elements_text(pv.value_json) AS elem ON true`
      : sql.raw('');

  const expr = bucketExpr(group);
  const query = sql`SELECT ${expr} AS bucket_key, COUNT(DISTINCT n.id)::int AS c FROM notes n ${join} ${lateral} WHERE ${where} GROUP BY bucket_key`;
  const result = (await db.execute(query)) as unknown as Array<{
    bucket_key: string | null;
    c: number;
  }>;
  return result.map((r) => ({ key: r.bucket_key, count: r.c }));
}

/**
 * Resolve display labels for the bucket keys. Select/status/multiSelect read
 * option labels from `def.config.options`; relation does a single batched
 * `notes.title` lookup; everything else uses the key itself.
 */
async function resolveLabels(
  group: GroupConfig,
  def: PropertyDefinitionRow,
  keys: Array<string | null>,
): Promise<Map<string | null, string>> {
  const out = new Map<string | null, string>();
  out.set(null, 'Empty');
  const real = keys.filter((k): k is string => typeof k === 'string');

  if (group.type === 'checkbox') {
    out.set('true', 'Checked');
    out.set('false', 'Unchecked');
    return out;
  }
  if (group.type === 'select' || group.type === 'status' || group.type === 'multiSelect') {
    const opts = (def.config as { options?: Array<{ id: string; label: string }> } | null)?.options ?? [];
    for (const o of opts) out.set(o.id, o.label);
    for (const k of real) if (!out.has(k)) out.set(k, k);
    return out;
  }
  if (group.type === 'relation' && real.length > 0) {
    const titles = await db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(inArray(notes.id, real));
    for (const t of titles) out.set(t.id, t.title || 'Untitled');
    for (const k of real) if (!out.has(k)) out.set(k, k);
    return out;
  }
  for (const k of real) out.set(k, k);
  return out;
}

/** Apply the configured group ordering. Stable sort, manual order takes index. */
function sortBuckets(buckets: QueryGroupBucket[], group: GroupConfig): QueryGroupBucket[] {
  const dir = group.sortGroups;
  if (dir === 'manual') {
    const order = new Map((group.manualOrder ?? []).map((k, i) => [k, i] as const));
    return [...buckets].sort((a, b) => {
      const ai = a.key === null ? Number.MAX_SAFE_INTEGER : order.get(a.key) ?? Number.MAX_SAFE_INTEGER - 1;
      const bi = b.key === null ? Number.MAX_SAFE_INTEGER : order.get(b.key) ?? Number.MAX_SAFE_INTEGER - 1;
      if (ai !== bi) return ai - bi;
      return a.label.localeCompare(b.label);
    });
  }
  const sign = dir === 'desc' ? -1 : 1;
  return [...buckets].sort((a, b) => {
    // Empty bucket always pinned to the end regardless of direction.
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return sign * a.label.localeCompare(b.label);
  });
}

const WARNED = new Set<string>();
function warnOnce(message: string): void {
  if (WARNED.has(message)) return;
  WARNED.add(message);
  console.warn(`[views/group] ${message}`);
}
