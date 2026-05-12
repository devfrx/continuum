/**
 * Filter compiler — turn a {@link FilterTree} into a single SQL fragment
 * suitable for the outer `WHERE` clause of a view query.
 *
 * Each leaf {@link FilterRule} compiles to a `notes.id (NOT) IN (SELECT
 * note_id FROM property_values WHERE property_id = '<uuid>' AND <expr>)`
 * subquery. This composes cleanly with the sparse-column store and lets
 * us combine arbitrarily-nested AND/OR groups via boolean folding.
 *
 * Property types whose value is computed at request time (`formula`,
 * `rollup`, `createdTime`, `createdBy`, `lastEditedTime`, `lastEditedBy`,
 * `button`, `uniqueId`) are intentionally **not** filterable in M2 — they
 * are not stored in `property_values`, so the subquery would always be
 * empty. Filtering on these is tracked as a TODO for M6+ once the engine
 * grows a computed-property staging table.
 */

import { sql, type SQL } from 'drizzle-orm';
import type {
  FilterTree,
  FilterGroup,
  FilterRule,
  FilterOperator,
  FilterValue,
  RelativeDatePreset,
  PropertyType,
} from '@continuum/shared';
import { OPERATORS_BY_TYPE } from '@continuum/shared';
import type { PropertyDefinitionRow } from '../../db/schema.js';

// ───────────────────────── Public API ─────────────────────────

/**
 * Compile a {@link FilterTree} into a SQL fragment that can be `AND`-ed
 * onto the outer `WHERE` of the view query.
 *
 * @returns `undefined` when the tree is empty or every rule was dropped
 *   (unknown property, computed type, invalid operator).
 */
export function compileFilter(
  defs: PropertyDefinitionRow[],
  tree: FilterTree,
): SQL | undefined {
  const byKey = new Map(defs.map((d) => [d.key, d] as const));
  return compileGroup(tree, byKey);
}

// ───────────────────────── Internals ─────────────────────────

/** Property types whose values are not stored in `property_values`. */
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

function compileGroup(
  group: FilterGroup,
  byKey: Map<string, PropertyDefinitionRow>,
): SQL | undefined {
  const fragments: SQL[] = [];
  for (const node of group.rules) {
    const f =
      node.type === 'group' ? compileGroup(node, byKey) : compileRule(node, byKey);
    if (f) fragments.push(f);
  }
  if (fragments.length === 0) return undefined;
  if (fragments.length === 1) return sql`(${fragments[0]})`;
  const sep = group.combinator === 'or' ? sql` OR ` : sql` AND `;
  return sql`(${sql.join(fragments, sep)})`;
}

function compileRule(
  rule: FilterRule,
  byKey: Map<string, PropertyDefinitionRow>,
): SQL | undefined {
  const def = byKey.get(rule.propertyKey);
  if (!def) {
    warnOnce(`unknown property key "${rule.propertyKey}" — rule dropped`);
    return undefined;
  }
  const type = def.type as PropertyType;
  if (SKIP_TYPES.has(type)) {
    warnOnce(`property "${def.key}" of type "${type}" is computed — filter skipped (TODO M6+)`);
    return undefined;
  }
  const allowed = OPERATORS_BY_TYPE[type];
  if (!allowed.includes(rule.operator)) {
    warnOnce(`operator "${rule.operator}" not allowed for type "${type}" — rule dropped`);
    return undefined;
  }

  // Empty-checks always go through presence of the row in property_values.
  if (rule.operator === 'is_empty') return notExistsValue(def.id);
  if (rule.operator === 'is_not_empty') return existsValue(def.id);

  const expr = compileExpr(type, rule.operator, rule.value);
  if (!expr) return undefined;
  return existsValueWith(def.id, expr);
}

// ─────────────── Subquery shells ───────────────

function existsValue(propertyId: string): SQL {
  return sql`n.id IN (SELECT note_id FROM property_values WHERE property_id = ${propertyId})`;
}

function notExistsValue(propertyId: string): SQL {
  return sql`n.id NOT IN (SELECT note_id FROM property_values WHERE property_id = ${propertyId})`;
}

function existsValueWith(propertyId: string, expr: SQL): SQL {
  return sql`n.id IN (SELECT note_id FROM property_values WHERE property_id = ${propertyId} AND ${expr})`;
}

// ─────────────── Per-type expression builders ───────────────

function compileExpr(
  type: PropertyType,
  op: FilterOperator,
  value: FilterValue | undefined,
): SQL | undefined {
  switch (type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
      return textExpr(op, value);
    case 'number':
    case 'progress':
      return numberExpr(op, value);
    case 'checkbox':
      return checkboxExpr(op, value);
    case 'date':
      return dateExpr(sql`value_date`, op, value);
    case 'dateRange':
      // Compare against the range start; filtering on the end is left for
      // M6+ when range-aware operators land in the UI.
      return dateExpr(sql`(value_json->>'from')::timestamptz`, op, value);
    case 'multiSelect':
    case 'relation':
      return jsonArrayExpr(op, value);
    case 'verification':
      return verificationExpr(op, value);
    case 'files':
      // Only is_empty / is_not_empty are valid for files; handled upstream.
      return undefined;
    default:
      return undefined;
  }
}

// ─────────────── Text ───────────────

function textExpr(op: FilterOperator, value: FilterValue | undefined): SQL | undefined {
  if (typeof value !== 'string') return undefined;
  switch (op) {
    case 'equals':
      return sql`value_text = ${value}`;
    case 'not_equals':
      return sql`value_text <> ${value}`;
    case 'contains':
      return sql`value_text ILIKE ${'%' + escapeLike(value) + '%'}`;
    case 'not_contains':
      return sql`value_text NOT ILIKE ${'%' + escapeLike(value) + '%'}`;
    case 'starts_with':
      return sql`value_text ILIKE ${escapeLike(value) + '%'}`;
    case 'ends_with':
      return sql`value_text ILIKE ${'%' + escapeLike(value)}`;
    default:
      return undefined;
  }
}

// ─────────────── Number ───────────────

function numberExpr(op: FilterOperator, value: FilterValue | undefined): SQL | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  switch (op) {
    case 'equals':
      return sql`value_number = ${value}`;
    case 'not_equals':
      return sql`value_number <> ${value}`;
    case 'gt':
      return sql`value_number > ${value}`;
    case 'gte':
      return sql`value_number >= ${value}`;
    case 'lt':
      return sql`value_number < ${value}`;
    case 'lte':
      return sql`value_number <= ${value}`;
    default:
      return undefined;
  }
}

// ─────────────── Checkbox ───────────────

function checkboxExpr(op: FilterOperator, value: FilterValue | undefined): SQL | undefined {
  if (typeof value !== 'boolean') return undefined;
  if (op === 'is') return sql`value_bool = ${value}`;
  if (op === 'is_not') return sql`value_bool <> ${value}`;
  return undefined;
}

// ─────────────── Date ───────────────

function dateExpr(
  column: SQL,
  op: FilterOperator,
  value: FilterValue | undefined,
): SQL | undefined {
  if (op === 'between') {
    const v = value as { from?: string; to?: string } | undefined;
    if (!v?.from || !v?.to) return undefined;
    return sql`${column} >= ${new Date(v.from)} AND ${column} <= ${new Date(v.to)}`;
  }
  if (op === 'relative') {
    const v = value as { preset?: RelativeDatePreset } | undefined;
    if (!v?.preset) return undefined;
    const window = relativeWindow(v.preset);
    if (!window) return undefined;
    const [from, to] = window;
    if (from && to) return sql`${column} >= ${from} AND ${column} <= ${to}`;
    if (from) return sql`${column} >= ${from}`;
    if (to) return sql`${column} <= ${to}`;
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  switch (op) {
    case 'equals':
      return sql`${column} = ${d}`;
    case 'before':
      return sql`${column} < ${d}`;
    case 'after':
      return sql`${column} > ${d}`;
    case 'on_or_before':
      return sql`${column} <= ${d}`;
    case 'on_or_after':
      return sql`${column} >= ${d}`;
    default:
      return undefined;
  }
}

/** Resolve a relative-date preset to a `[from, to]` window (either may be null). */
function relativeWindow(preset: RelativeDatePreset): [Date | null, Date | null] | null {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

  switch (preset) {
    case 'today':
      return [startOfDay(now), endOfDay(now)];
    case 'tomorrow':
      return [startOfDay(addDays(now, 1)), endOfDay(addDays(now, 1))];
    case 'yesterday':
      return [startOfDay(addDays(now, -1)), endOfDay(addDays(now, -1))];
    case 'this_week': {
      // Treat the week as Mon → Sun.
      const dow = (now.getDay() + 6) % 7; // 0 = Mon
      const monday = startOfDay(addDays(now, -dow));
      return [monday, endOfDay(addDays(monday, 6))];
    }
    case 'last_week': {
      const dow = (now.getDay() + 6) % 7;
      const monday = startOfDay(addDays(now, -dow - 7));
      return [monday, endOfDay(addDays(monday, 6))];
    }
    case 'next_week': {
      const dow = (now.getDay() + 6) % 7;
      const monday = startOfDay(addDays(now, -dow + 7));
      return [monday, endOfDay(addDays(monday, 6))];
    }
    case 'this_month':
      return [startOfMonth(now), endOfMonth(now)];
    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [startOfMonth(prev), endOfMonth(prev)];
    }
    case 'next_month': {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return [startOfMonth(next), endOfMonth(next)];
    }
    case 'past':
      return [null, now];
    case 'future':
      return [now, null];
    default:
      return null;
  }
}

// ─────────────── JSON arrays (multiSelect / relation) ───────────────

function jsonArrayExpr(op: FilterOperator, value: FilterValue | undefined): SQL | undefined {
  switch (op) {
    case 'contains': {
      if (typeof value !== 'string') return undefined;
      return sql`value_json @> ${JSON.stringify([value])}::jsonb`;
    }
    case 'not_contains': {
      if (typeof value !== 'string') return undefined;
      return sql`NOT (value_json @> ${JSON.stringify([value])}::jsonb)`;
    }
    case 'contains_all': {
      if (!Array.isArray(value) || value.length === 0) return undefined;
      return sql`value_json @> ${JSON.stringify(value)}::jsonb`;
    }
    default:
      return undefined;
  }
}

// ─────────────── Verification ───────────────

function verificationExpr(
  op: FilterOperator,
  value: FilterValue | undefined,
): SQL | undefined {
  if (typeof value !== 'string') return undefined;
  if (op === 'is') return sql`value_json->>'state' = ${value}`;
  if (op === 'is_not') return sql`value_json->>'state' <> ${value}`;
  return undefined;
}

// ─────────────── Helpers ───────────────

/** Escape `%` and `_` so user input doesn't act as wildcards in `ILIKE`. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const WARNED = new Set<string>();
function warnOnce(message: string): void {
  if (WARNED.has(message)) return;
  WARNED.add(message);
  console.warn(`[views/filter] ${message}`);
}
