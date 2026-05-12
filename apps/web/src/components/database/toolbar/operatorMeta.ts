/**
 * Per-operator UI metadata for the filter rule editor.
 *
 * Keeps the human-facing label and the value-input arity in one table so
 * `FilterRuleEditor` can render the right value control without a giant
 * switch in the template.
 *
 * `arity` semantics:
 *   - `none`     → no value input (`is_empty`, `is_not_empty`).
 *   - `one`      → single scalar input (text / number / date / boolean / id).
 *   - `two-date` → `{ from, to }` paired date inputs (`between`).
 *   - `preset`   → relative-date preset selector (`relative`).
 */
import type {
    FilterOperator,
    FilterValue,
    PropertyType,
    RelativeDatePreset,
} from '@continuum/shared';

/** Arity of the value-side of a filter rule. */
export type OperatorArity = 'none' | 'one' | 'two-date' | 'preset';

/** Human label + arity for one operator. */
export interface OperatorMeta {
    id: FilterOperator;
    label: string;
    arity: OperatorArity;
}

/**
 * Static catalogue. Arity defaults are correct for the textual / numeric /
 * selection variants; date-specific operators override where needed.
 */
export const OPERATOR_META: Record<FilterOperator, OperatorMeta> = {
    equals: { id: 'equals', label: 'is', arity: 'one' },
    not_equals: { id: 'not_equals', label: 'is not', arity: 'one' },
    is: { id: 'is', label: 'is', arity: 'one' },
    is_not: { id: 'is_not', label: 'is not', arity: 'one' },
    contains: { id: 'contains', label: 'contains', arity: 'one' },
    not_contains: { id: 'not_contains', label: 'does not contain', arity: 'one' },
    contains_all: { id: 'contains_all', label: 'contains all of', arity: 'one' },
    starts_with: { id: 'starts_with', label: 'starts with', arity: 'one' },
    ends_with: { id: 'ends_with', label: 'ends with', arity: 'one' },
    gt: { id: 'gt', label: '>', arity: 'one' },
    gte: { id: 'gte', label: '≥', arity: 'one' },
    lt: { id: 'lt', label: '<', arity: 'one' },
    lte: { id: 'lte', label: '≤', arity: 'one' },
    before: { id: 'before', label: 'is before', arity: 'one' },
    after: { id: 'after', label: 'is after', arity: 'one' },
    on_or_before: { id: 'on_or_before', label: 'is on or before', arity: 'one' },
    on_or_after: { id: 'on_or_after', label: 'is on or after', arity: 'one' },
    between: { id: 'between', label: 'is between', arity: 'two-date' },
    relative: { id: 'relative', label: 'is within', arity: 'preset' },
    is_empty: { id: 'is_empty', label: 'is empty', arity: 'none' },
    is_not_empty: { id: 'is_not_empty', label: 'is not empty', arity: 'none' },
};

/** Default relative preset used when switching an operator into `relative`. */
const DEFAULT_PRESET: RelativeDatePreset = 'today';

/**
 * Compute a sensible default `value` for a fresh rule, given the property
 * type and the chosen operator. Returns `undefined` when the operator is
 * value-less (e.g. `is_empty`).
 */
export function defaultValueFor(
    type: PropertyType,
    op: FilterOperator,
): FilterValue | undefined {
    const meta = OPERATOR_META[op];
    if (meta.arity === 'none') return undefined;
    if (meta.arity === 'preset') return { preset: DEFAULT_PRESET };
    if (meta.arity === 'two-date') {
        const today = new Date().toISOString().slice(0, 10);
        return { from: today, to: today };
    }
    // arity === 'one'
    switch (type) {
        case 'number':
        case 'progress':
            return 0;
        case 'checkbox':
            return true;
        case 'multiSelect':
        case 'relation':
            return [];
        case 'date':
        case 'createdTime':
        case 'lastEditedTime':
            return new Date().toISOString().slice(0, 10);
        case 'verification':
            return 'verified';
        default:
            return '';
    }
}
