/**
 * databases/filtering/evaluate.ts — pure, synchronous in-memory
 * evaluator for the database-view filter & sort engine.
 *
 * Used by `useDatabaseViewQuery` to derive `finalRows` from the raw
 * server-supplied rows so every view renderer sees the same filtered
 * and sorted dataset regardless of layout. Pure functions only — no
 * side effects, no I/O — to keep the pipeline trivially testable.
 *
 * The evaluator understands all property types listed in
 * `operatorsForType()`; unknown shapes degrade gracefully to a
 * non-match (filter) or stable equality (sort) so a future property
 * type addition never crashes existing views.
 */
import type {
    DatabaseRowSnapshot,
    NoteProperty,
    PropertyDefinition,
    PropertyValue,
} from '@continuum/shared';
import { isFilterCondition, isFilterGroup } from '@continuum/shared';
import type {
    FilterCondition,
    FilterNode,
    FilterValue,
    SortRule,
} from './types';

// ───────────────── Optional evaluator context ─────────────────

/**
 * Pluggable resolver for `kind: 'viewMeta'` field refs. The filter
 * engine is decoupled from the conditional-color module — callers
 * (typically `useDatabaseViewQuery`) pass a tiny callback that knows
 * how to derive view-scoped metadata for a row. Omitting the
 * resolver makes every `viewMeta` field evaluate as empty, which is
 * the correct behaviour when no view metadata is in play (e.g. inside
 * the conditional-color rule editor itself).
 */
export type ViewMetaResolver = (
    row: DatabaseRowSnapshot,
    id: string,
) => unknown;

/** Optional evaluator context threaded through every public entry point. */
export interface EvaluatorContext {
    /** Resolver for synthetic `kind: 'viewMeta'` field refs. */
    resolveViewMeta?: ViewMetaResolver | null;
}

// ───────────────── Value extraction ─────────────────

/**
 * Resolve the raw value used by an operator for a given field. The
 * returned shape is the underlying `PropertyValue['value']`, the row
 * note's title, or `null` when the property is unset.
 */
function readFieldValue(
    row: DatabaseRowSnapshot,
    field: FilterCondition['field'],
    schema: readonly PropertyDefinition[],
    ctx?: EvaluatorContext,
): { type: string; value: unknown } | null {
    if (field.kind === 'system') {
        switch (field.id) {
            case 'note.title':
                return { type: 'text', value: row.note.title };
            case 'note.kind':
                return { type: 'text', value: row.note.kind };
            case 'note.folderId':
                return { type: 'text', value: row.note.folderId };
            case 'note.locked':
                return { type: 'checkbox', value: row.note.locked };
            case 'note.createdAt':
                return { type: 'date', value: row.note.createdAt };
            case 'note.updatedAt':
                return { type: 'date', value: row.note.updatedAt };
            case 'note.tags':
                return { type: 'multiSelect', value: row.note.tags };
            default:
                return null;
        }
    }
    if (field.kind === 'property') {
        const def = schema.find((d) => d.key === field.key);
        if (!def) return null;
        const prop = row.properties.find((p) => p.definition.id === def.id);
        return propertyValue(prop, def);
    }
    if (field.kind === 'viewMeta') {
        const resolver = ctx?.resolveViewMeta;
        if (!resolver) return null;
        const value = resolver(row, field.id);
        return value === null || value === undefined
            ? null
            : { type: 'select', value };
    }
    return null;
}

/** Normalised `{type,value}` view of a `NoteProperty`; `null` when unset. */
function propertyValue(
    prop: NoteProperty | undefined,
    def: PropertyDefinition,
): { type: string; value: unknown } | null {
    if (!prop || prop.value === null) return null;
    return { type: def.type, value: extractValue(prop.value) };
}

/** Pull the comparable scalar out of any `PropertyValue` discriminant. */
function extractValue(pv: PropertyValue): unknown {
    switch (pv.type) {
        case 'dateRange':
            // Use `from` as the canonical comparable date — `to` is honoured
            // by the inRange operator only.
            return pv.value;
        case 'verification':
            return pv.state;
        case 'button':
            return null;
        case 'uniqueId':
            return pv.sequence;
        case 'rollup':
        case 'formula':
            return pv.value;
        default:
            // All remaining variants expose a `value` field.
            return (pv as { value: unknown }).value;
    }
}

// ───────────────── Helpers ─────────────────

function isEmpty(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') {
        const o = v as { from?: unknown; to?: unknown };
        if ('from' in o || 'to' in o) {
            return (typeof o.from !== 'string' || o.from === '')
                && (typeof o.to !== 'string' || o.to === '');
        }
    }
    return false;
}

function asString(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
}

function asNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function asDate(v: unknown): number | null {
    if (typeof v === 'string' && v) {
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : null;
    }
    if (v && typeof v === 'object') {
        const from = (v as { from?: string }).from;
        if (typeof from === 'string' && from) {
            const t = Date.parse(from);
            return Number.isFinite(t) ? t : null;
        }
    }
    return null;
}

function asStringList(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x));
    if (typeof v === 'string') return v ? [v] : [];
    return [];
}

function startOfDay(ts: number): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function daysFromNow(days: number): { from: number; to: number } {
    const today = startOfDay(Date.now());
    const span = days * 24 * 3600 * 1000;
    return { from: today, to: today + span };
}

// ───────────────── Condition matcher ─────────────────

/**
 * Evaluate one condition against one row. Unary operators
 * (`isEmpty`, `today`, …) ignore `condition.value`; binary operators
 * coerce the row value to the right shape before comparing.
 */
function matchCondition(
    row: DatabaseRowSnapshot,
    condition: FilterCondition,
    schema: readonly PropertyDefinition[],
    ctx?: EvaluatorContext,
): boolean {
    const cell = readFieldValue(row, condition.field, schema, ctx);
    const raw = cell?.value ?? null;
    const v: FilterValue = condition.value;
    switch (condition.operator) {
        case 'isEmpty':
            return isEmpty(raw);
        case 'isNotEmpty':
            return !isEmpty(raw);
        case 'isTrue':
            return raw === true;
        case 'isFalse':
            return raw === false || raw === null || raw === undefined;
        case 'eq':
            return compareEq(raw, v);
        case 'neq':
            return !compareEq(raw, v);
        case 'contains':
            return asString(raw).toLowerCase().includes(stringOf(v).toLowerCase());
        case 'notContains':
            return !asString(raw).toLowerCase().includes(stringOf(v).toLowerCase());
        case 'startsWith':
            return asString(raw).toLowerCase().startsWith(stringOf(v).toLowerCase());
        case 'endsWith':
            return asString(raw).toLowerCase().endsWith(stringOf(v).toLowerCase());
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            return compareNumeric(raw, v, condition.operator);
        case 'between': {
            const n = asNumber(raw);
            if (n === null) return false;
            if (v.kind !== 'numberRange') return false;
            return n >= v.from && n <= v.to;
        }
        case 'inAny':
            return arrayOverlap(raw, stringListOf(v));
        case 'inAll': {
            const want = stringListOf(v);
            const have = asStringList(raw);
            return want.every((w) => have.includes(w));
        }
        case 'notIn':
            return !arrayOverlap(raw, stringListOf(v));
        case 'before':
        case 'after':
        case 'onOrBefore':
        case 'onOrAfter':
            return compareDate(raw, v, condition.operator);
        case 'inRange': {
            const t = asDate(raw);
            if (t === null) return false;
            if (v.kind !== 'dateRange') return false;
            const from = Date.parse(v.from);
            const to = Date.parse(v.to);
            if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
            return t >= from && t <= to;
        }
        case 'today':
        case 'thisWeek':
        case 'thisMonth':
        case 'thisYear':
            return matchDatePreset(raw, condition.operator);
        case 'lastNDays':
        case 'nextNDays': {
            const t = asDate(raw);
            if (t === null) return false;
            if (v.kind !== 'duration') return false;
            const range = condition.operator === 'lastNDays'
                ? { from: startOfDay(Date.now()) - v.days * 86400000, to: startOfDay(Date.now()) + 86400000 }
                : daysFromNow(v.days);
            return t >= range.from && t <= range.to;
        }
        default:
            return true;
    }
}

function stringOf(v: FilterValue): string {
    if (v.kind === 'string') return v.value;
    if (v.kind === 'number') return String(v.value);
    if (v.kind === 'date') return v.value;
    return '';
}

function stringListOf(v: FilterValue): string[] {
    if (v.kind === 'stringList') return v.values;
    if (v.kind === 'string') return v.value ? [v.value] : [];
    return [];
}

function compareEq(raw: unknown, v: FilterValue): boolean {
    if (v.kind === 'string') return asString(raw).toLowerCase() === v.value.toLowerCase();
    if (v.kind === 'number') return asNumber(raw) === v.value;
    if (v.kind === 'boolean') return Boolean(raw) === v.value;
    if (v.kind === 'date') {
        const a = asDate(raw);
        const b = asDate(v.value);
        return a !== null && b !== null && a === b;
    }
    return false;
}

function compareNumeric(
    raw: unknown,
    v: FilterValue,
    op: 'gt' | 'gte' | 'lt' | 'lte',
): boolean {
    const a = asNumber(raw);
    if (a === null) return false;
    if (v.kind !== 'number') return false;
    switch (op) {
        case 'gt': return a > v.value;
        case 'gte': return a >= v.value;
        case 'lt': return a < v.value;
        case 'lte': return a <= v.value;
    }
}

function compareDate(
    raw: unknown,
    v: FilterValue,
    op: 'before' | 'after' | 'onOrBefore' | 'onOrAfter',
): boolean {
    if (v.kind !== 'date') return false;
    const a = asDate(raw);
    const b = asDate(v.value);
    if (a === null || b === null) return false;
    switch (op) {
        case 'before': return a < b;
        case 'after': return a > b;
        case 'onOrBefore': return a <= b;
        case 'onOrAfter': return a >= b;
    }
}

function matchDatePreset(
    raw: unknown,
    op: 'today' | 'thisWeek' | 'thisMonth' | 'thisYear',
): boolean {
    const t = asDate(raw);
    if (t === null) return false;
    const d = new Date(t);
    const now = new Date();
    switch (op) {
        case 'today':
            return d.toDateString() === now.toDateString();
        case 'thisWeek': {
            const day = (now.getDay() + 6) % 7;
            const start = startOfDay(now.getTime() - day * 86400000);
            return t >= start && t < start + 7 * 86400000;
        }
        case 'thisMonth':
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        case 'thisYear':
            return d.getFullYear() === now.getFullYear();
    }
}

function arrayOverlap(raw: unknown, want: string[]): boolean {
    if (want.length === 0) return false;
    const have = asStringList(raw);
    return have.some((h) => want.includes(h));
}

// ───────────────── Tree walker ─────────────────

/** Recursively evaluate a `FilterNode`. Empty groups match every row. */
export function matchFilter(
    row: DatabaseRowSnapshot,
    node: FilterNode | null | undefined,
    schema: readonly PropertyDefinition[],
    ctx?: EvaluatorContext,
): boolean {
    if (!node) return true;
    if (isFilterCondition(node)) return matchCondition(row, node, schema, ctx);
    if (isFilterGroup(node)) {
        if (node.children.length === 0) return true;
        if (node.combinator === 'and') {
            return node.children.every((c) => matchFilter(row, c, schema, ctx));
        }
        return node.children.some((c) => matchFilter(row, c, schema, ctx));
    }
    return true;
}

// ───────────────── Sort ─────────────────

/**
 * Returns a stable, *new* array sorted by the supplied rules. The
 * caller's input is never mutated. Ties fall through to the row's
 * `position` so the renderer stays deterministic.
 */
export function applySort(
    rows: readonly DatabaseRowSnapshot[],
    rules: readonly SortRule[],
    schema: readonly PropertyDefinition[],
    ctx?: EvaluatorContext,
): DatabaseRowSnapshot[] {
    if (rules.length === 0) return [...rows];
    const indexed = rows.map((row, i) => ({ row, i }));
    indexed.sort((a, b) => {
        for (const rule of rules) {
            const av = readFieldValue(a.row, rule.field, schema, ctx)?.value ?? null;
            const bv = readFieldValue(b.row, rule.field, schema, ctx)?.value ?? null;
            const cmp = compareValues(av, bv);
            if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
        }
        // Stable fallback: original position then array index.
        const pa = a.row.position;
        const pb = b.row.position;
        if (pa < pb) return -1;
        if (pa > pb) return 1;
        return a.i - b.i;
    });
    return indexed.map((entry) => entry.row);
}

function compareValues(a: unknown, b: unknown): number {
    const aEmpty = isEmpty(a);
    const bEmpty = isEmpty(b);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'boolean' && typeof b === 'boolean') {
        return a === b ? 0 : a ? -1 : 1;
    }
    const da = asDate(a);
    const db = asDate(b);
    if (da !== null && db !== null) return da - db;
    return asString(a).localeCompare(asString(b), undefined, { sensitivity: 'base' });
}
