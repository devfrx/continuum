/**
 * summary/summarize.ts — chip-data helpers for the Database view
 * summary bar.
 *
 * The summary bar makes the *currently applied* filter & sort visible
 * at the top of every database view (mirroring Notion's behaviour) so
 * the user never has to drill into the View options popover just to
 * see what's narrowing or ordering the rows.
 *
 * These helpers project a `FilterNode` tree and a `SortRule[]` list
 * onto a flat, render-ready array of "chip" objects. They are the
 * single source of truth for both the chip labels and the per-chip
 * "remove" action (each chip carries its source `id` so the bar can
 * patch the view's config without re-walking the tree).
 *
 * Implementation notes:
 *   – Nested filter groups are flattened to their leaf conditions. The
 *     bar represents the same shape the `FilterPanel` exposes today
 *     (root group with leaf conditions), and the chip list reads
 *     left-to-right matching the panel's order.
 *   – Field resolution reuses the same `describeFields` helper the
 *     panels use, so a chip's field label always matches what the user
 *     sees inside the popover.
 *   – Value rendering is intentionally conservative: short strings get
 *     quoted, option ids are mapped to their labels, unary operators
 *     hide the value segment entirely. Anything else falls back to the
 *     operator label alone (we never invent a misleading preview).
 */
import { FILTER_OPERATORS, isFilterGroup } from '@continuum/shared';
import type {
    ConditionalColorRule,
    DatabaseViewConfig,
    FieldRef,
    PropertyDefinition,
    PropertyOption,
    SortRule,
} from '@continuum/shared';
import { describeFields } from '../filtering/operators';
import type {
    DatabaseFieldDescriptor,
    FilterCondition,
    FilterNode,
    FilterOperatorId,
    FilterValue,
} from '../filtering/types';
import { CONDITIONAL_COLOR_FIELD_ID, TITLE_FIELD_ID } from '../filtering/types';
import { colorTokenById } from '../conditionalColor/palette';

/** Render-ready chip representing a single filter condition. */
export interface FilterChip {
    /** Mirrors the source `FilterCondition.id` for keyed removal. */
    id: string;
    /** Field label (e.g. "Title", "Status"). */
    fieldLabel: string;
    /** Operator label (e.g. "contains", "is empty"). */
    operatorLabel: string;
    /** Pretty-printed value, or `null` for unary operators. */
    valueLabel: string | null;
    /** Underlying descriptor (kept for future affordances). */
    descriptor: DatabaseFieldDescriptor | null;
}

/** Render-ready chip representing a single sort rule. */
export interface SortChip {
    /** Mirrors the source `SortRule.id` for keyed removal. */
    id: string;
    fieldLabel: string;
    direction: 'asc' | 'desc';
    descriptor: DatabaseFieldDescriptor | null;
}

/** Render-ready chip representing a single conditional-color rule. */
export interface ConditionalColorChip {
    /** Mirrors the source `ConditionalColorRule.id` for keyed removal. */
    id: string;
    fieldLabel: string;
    operatorLabel: string;
    valueLabel: string | null;
    /** Number of extra conditions when a future compound rule is persisted. */
    extraConditionCount: number;
    colorLabel: string;
    colorSwatch: string;
    scopeLabel: string;
    targetLabel: string;
    descriptor: DatabaseFieldDescriptor | null;
}

export interface SummaryFieldOptions {
    /** Active conditional-color rules, used to label `viewMeta` filter/sort fields. */
    conditionalColors?: readonly ConditionalColorRule[] | null;
}

// ─────────────────────────── Field resolution ──────────────────────────

function descriptorOfRef(
    ref: FieldRef,
    descriptors: readonly DatabaseFieldDescriptor[],
): DatabaseFieldDescriptor | null {
    if (ref.kind === 'system' && ref.id === 'note.title') {
        return descriptors.find((d) => d.id === TITLE_FIELD_ID) ?? null;
    }
    if (ref.kind === 'property') {
        return descriptors.find((d) => d.definition?.key === ref.key) ?? null;
    }
    if (ref.kind === 'viewMeta' && ref.id === 'view.conditionalColor') {
        return descriptors.find((d) => d.id === CONDITIONAL_COLOR_FIELD_ID) ?? null;
    }
    return null;
}

// ─────────────────────────── Filter chips ──────────────────────────────

/**
 * Walk a filter tree and yield its leaf conditions left-to-right.
 * Groups are flattened transparently — the summary bar does not (yet)
 * surface nested combinators, which keeps the chip strip readable and
 * matches what the `FilterPanel` currently renders.
 */
function* iterateConditions(node: FilterNode): IterableIterator<FilterCondition> {
    if (node.type === 'condition') {
        yield node;
        return;
    }
    for (const child of node.children) yield* iterateConditions(child);
}

function quote(value: string): string {
    return `"${value}"`;
}

function truncate(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
}

function optionLabelOf(def: PropertyDefinition | null, optionId: string): string {
    if (!def) return optionId;
    const cfg = def.config as { options?: PropertyOption[] } | undefined;
    const match = cfg?.options?.find((o) => o.id === optionId);
    return match?.label ?? optionId;
}

/**
 * Pretty-print a `FilterValue` for chip display. Returns `null` when
 * the operator is unary (`isEmpty`, `today`, …) so the caller can hide
 * the value segment entirely.
 */
function formatValue(
    operator: FilterOperatorId,
    value: FilterValue,
    descriptor: DatabaseFieldDescriptor | null,
): string | null {
    const op = FILTER_OPERATORS[operator];
    if (op && op.valueKinds.length === 1 && op.valueKinds[0] === 'none') return null;

    switch (value.kind) {
        case 'none':
            return null;
        case 'string': {
            const trimmed = value.value.trim();
            return trimmed ? quote(truncate(trimmed, 24)) : '…';
        }
        case 'number':
            return Number.isFinite(value.value) ? String(value.value) : '…';
        case 'numberRange':
            return `${value.from} – ${value.to}`;
        case 'boolean':
            return value.value ? 'true' : 'false';
        case 'date':
            return value.value || '…';
        case 'dateRange':
            return `${value.from || '…'} → ${value.to || '…'}`;
        case 'duration':
            return `${value.days} days`;
        case 'stringList': {
            if (value.values.length === 0) return '…';
            const def = descriptor?.definition ?? null;
            const labels = value.values.map((id) => optionLabelOf(def, id));
            const head = labels.slice(0, 2).join(', ');
            const tail = labels.length > 2 ? ` +${labels.length - 2}` : '';
            return truncate(head, 28) + tail;
        }
        default:
            return null;
    }
}

function conditionToFilterChip(
    condition: FilterCondition,
    descriptors: readonly DatabaseFieldDescriptor[],
): FilterChip {
    const descriptor = descriptorOfRef(condition.field, descriptors);
    const op = FILTER_OPERATORS[condition.operator];
    return {
        id: condition.id,
        fieldLabel: descriptor?.label ?? 'Field',
        operatorLabel: op?.label ?? condition.operator,
        valueLabel: formatValue(condition.operator, condition.value, descriptor),
        descriptor,
    };
}

function previewConditionNode(
    node: FilterNode,
    descriptors: readonly DatabaseFieldDescriptor[],
): Omit<ConditionalColorChip, 'id' | 'colorLabel' | 'colorSwatch' | 'scopeLabel' | 'targetLabel'> {
    const conditions = Array.from(iterateConditions(node));
    const first = conditions[0];
    if (!first) {
        return {
            fieldLabel: 'Rows',
            operatorLabel: 'match',
            valueLabel: null,
            extraConditionCount: 0,
            descriptor: null,
        };
    }
    const chip = conditionToFilterChip(first, descriptors);
    return {
        fieldLabel: chip.fieldLabel,
        operatorLabel: chip.operatorLabel,
        valueLabel: chip.valueLabel,
        extraConditionCount: Math.max(conditions.length - 1, 0),
        descriptor: chip.descriptor,
    };
}

/**
 * Convert the active view's filter config into a flat list of chips
 * ready for `<DatabaseViewSummaryBar>`. Returns an empty array when
 * the filter is empty or undefined so callers can branch on
 * `chips.length === 0` to hide the bar.
 */
export function summarizeFilterChips(
    filter: DatabaseViewConfig['filter'] | null | undefined,
    schema: readonly PropertyDefinition[],
    options?: SummaryFieldOptions,
): FilterChip[] {
    if (!filter) return [];
    const descriptors = describeFields(schema, {
        conditionalColors: options?.conditionalColors ?? null,
    });
    const chips: FilterChip[] = [];
    const walk = isFilterGroup(filter) ? iterateConditions(filter) : iterateConditions(filter);
    for (const condition of walk) {
        chips.push(conditionToFilterChip(condition, descriptors));
    }
    return chips;
}

// ─────────────────────────── Sort chips ────────────────────────────────

/**
 * Convert the active view's sort rules into a flat chip list. Rules
 * whose underlying field has been removed from the schema still
 * surface (so the user can see and clear them) with a generic
 * "Unknown" label — matching the panel's defensive behaviour.
 */
export function summarizeSortChips(
    sort: readonly SortRule[] | null | undefined,
    schema: readonly PropertyDefinition[],
    options?: SummaryFieldOptions,
): SortChip[] {
    if (!sort || sort.length === 0) return [];
    const descriptors = describeFields(schema, {
        conditionalColors: options?.conditionalColors ?? null,
    });
    return sort.map((rule) => {
        const descriptor = descriptorOfRef(rule.field, descriptors);
        return {
            id: rule.id,
            fieldLabel: descriptor?.label ?? 'Unknown',
            direction: rule.direction,
            descriptor,
        };
    });
}

// ─────────────────── Conditional-color chips ─────────────────────────

function targetLabelOf(
    rule: ConditionalColorRule,
    schema: readonly PropertyDefinition[],
): string {
    if (rule.target === 'row') return 'Whole row';
    const property = schema.find((definition) => definition.key === rule.propertyKey);
    return property?.label ?? 'Unknown property';
}

function scopeLabelOf(rule: ConditionalColorRule): string {
    return rule.scope === 'text' ? 'text' : 'background';
}

/** Convert conditional-color rules into summary chips. */
export function summarizeConditionalColorChips(
    rules: readonly ConditionalColorRule[] | null | undefined,
    schema: readonly PropertyDefinition[],
): ConditionalColorChip[] {
    if (!rules || rules.length === 0) return [];
    const descriptors = describeFields(schema);
    return rules.map((rule) => {
        const token = colorTokenById(rule.color);
        const preview = previewConditionNode(rule.condition, descriptors);
        return {
            id: rule.id,
            ...preview,
            colorLabel: token.label,
            colorSwatch: token.swatch,
            scopeLabel: scopeLabelOf(rule),
            targetLabel: targetLabelOf(rule, schema),
        };
    });
}

// ─────────────────────────── Patch helpers ─────────────────────────────

/**
 * Build the `FilterNode` patch that removes a single condition from the
 * root group, given the view's current filter. Returns a fresh group
 * (never mutates the input) so the resulting patch is safe to pass
 * straight to `patch-view-config`.
 */
export function filterWithoutCondition(
    current: DatabaseViewConfig['filter'] | null | undefined,
    conditionId: string,
): DatabaseViewConfig['filter'] {
    const root = current && isFilterGroup(current)
        ? current
        : { type: 'group' as const, id: 'root', combinator: 'and' as const, children: current ? [current] : [] };
    return {
        type: 'group',
        id: root.id,
        combinator: root.combinator,
        children: root.children.filter((child) => child.type !== 'condition' || child.id !== conditionId),
    };
}

/** Build the sort-rule patch that removes a single rule by id. */
export function sortWithoutRule(
    current: readonly SortRule[] | null | undefined,
    ruleId: string,
): SortRule[] {
    if (!current) return [];
    return current.filter((rule) => rule.id !== ruleId);
}

/** Build the conditional-colour patch that removes one rule by id. */
export function conditionalColorsWithoutRule(
    current: readonly ConditionalColorRule[] | null | undefined,
    ruleId: string,
): ConditionalColorRule[] {
    if (!current) return [];
    return current.filter((rule) => rule.id !== ruleId);
}
