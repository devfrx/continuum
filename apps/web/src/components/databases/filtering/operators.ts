/**
 * databases/filtering/operators.ts — per-property-type operator catalogue
 * and value-kind helpers for the database-view filter & sort engine.
 *
 * The catalogue is the single source of truth used by:
 *   – `FilterPanel.vue` to render the operator dropdown,
 *   – `SortPanel.vue` to flag sortable property types,
 *   – `evaluate.ts` to coerce row values into comparable shapes.
 *
 * Operators reuse the canonical `FilterOperatorId` registry from
 * `@continuum/shared`; this file is only responsible for *which* of
 * those operators make sense for *which* property type, plus the
 * default `FilterValue` shape a fresh condition should adopt.
 */
import type {
    DatabaseFieldDescriptor,
    FilterOperatorId,
    FilterValue,
    PropertyDefinition,
    PropertyType,
} from './types';
import { TITLE_FIELD_ID } from './types';

/** Property types that map onto text-shaped operators. */
const TEXT_TYPES: ReadonlySet<PropertyType> = new Set([
    'text',
    'longText',
    'url',
    'email',
    'phone',
]);

/** Property types whose stored value is a single ISO 8601 timestamp. */
const DATE_TYPES: ReadonlySet<PropertyType> = new Set([
    'date',
    'createdTime',
    'lastEditedTime',
]);

/** Property types whose stored value is a numeric scalar. */
const NUMERIC_TYPES: ReadonlySet<PropertyType> = new Set(['number', 'progress']);

/** Property types backed by a single option id (select-style). */
const SINGLE_OPTION_TYPES: ReadonlySet<PropertyType> = new Set(['select', 'status']);

/** Property types backed by a list of option / target ids. */
const MULTI_OPTION_TYPES: ReadonlySet<PropertyType> = new Set([
    'multiSelect',
    'relation',
    'files',
]);

const TEXT_OPS: readonly FilterOperatorId[] = [
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'eq',
    'neq',
    'isEmpty',
    'isNotEmpty',
];

const NUMBER_OPS: readonly FilterOperatorId[] = [
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'isEmpty',
    'isNotEmpty',
];

const DATE_OPS: readonly FilterOperatorId[] = [
    'eq',
    'before',
    'after',
    'onOrBefore',
    'onOrAfter',
    'inRange',
    'today',
    'thisWeek',
    'thisMonth',
    'thisYear',
    'lastNDays',
    'nextNDays',
    'isEmpty',
    'isNotEmpty',
];

const SINGLE_OPTION_OPS: readonly FilterOperatorId[] = [
    'eq',
    'neq',
    'inAny',
    'notIn',
    'isEmpty',
    'isNotEmpty',
];

const MULTI_OPTION_OPS: readonly FilterOperatorId[] = [
    'inAny',
    'inAll',
    'notIn',
    'isEmpty',
    'isNotEmpty',
];

const CHECKBOX_OPS: readonly FilterOperatorId[] = ['isTrue', 'isFalse'];

const FALLBACK_OPS: readonly FilterOperatorId[] = ['isEmpty', 'isNotEmpty'];

/** Resolve the allowed operators for a given property type. */
export function operatorsForType(type: PropertyType): readonly FilterOperatorId[] {
    if (type === 'checkbox') return CHECKBOX_OPS;
    if (TEXT_TYPES.has(type)) return TEXT_OPS;
    if (NUMERIC_TYPES.has(type)) return NUMBER_OPS;
    if (DATE_TYPES.has(type)) return DATE_OPS;
    if (type === 'dateRange') return DATE_OPS;
    if (SINGLE_OPTION_TYPES.has(type)) return SINGLE_OPTION_OPS;
    if (MULTI_OPTION_TYPES.has(type)) return MULTI_OPTION_OPS;
    return FALLBACK_OPS;
}

/** `true` when this property type can drive a sort rule. */
export function isSortableType(type: PropertyType): boolean {
    if (type === 'button' || type === 'files') return false;
    return true;
}

/** Build the descriptor list shown by the field picker. */
export function describeFields(
    schema: readonly PropertyDefinition[],
): DatabaseFieldDescriptor[] {
    const title: DatabaseFieldDescriptor = {
        id: TITLE_FIELD_ID,
        label: 'Title',
        type: 'text',
        operators: operatorsForType('text'),
        definition: null,
    };
    const rest: DatabaseFieldDescriptor[] = schema.map((def) => ({
        id: def.id,
        label: def.label,
        type: def.type,
        operators: operatorsForType(def.type),
        definition: def,
    }));
    return [title, ...rest];
}

/** Lookup helper: descriptor for one field id (or `null` if unknown). */
export function describeField(
    schema: readonly PropertyDefinition[],
    fieldId: string,
): DatabaseFieldDescriptor | null {
    return describeFields(schema).find((d) => d.id === fieldId) ?? null;
}

/**
 * Default `FilterValue` shape for a fresh condition. Mirrors the
 * canonical `FilterOperatorDescriptor.valueKinds[0]` for the chosen
 * operator so the value editor mounts in a usable state immediately.
 */
export function defaultFilterValue(operator: FilterOperatorId): FilterValue {
    switch (operator) {
        case 'isEmpty':
        case 'isNotEmpty':
        case 'isTrue':
        case 'isFalse':
        case 'today':
        case 'thisWeek':
        case 'thisMonth':
        case 'thisYear':
            return { kind: 'none' };
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte':
            return { kind: 'number', value: 0 };
        case 'between':
            return { kind: 'numberRange', from: 0, to: 0 };
        case 'before':
        case 'after':
        case 'onOrBefore':
        case 'onOrAfter':
            return { kind: 'date', value: '' };
        case 'inRange':
            return { kind: 'dateRange', from: '', to: '' };
        case 'lastNDays':
        case 'nextNDays':
            return { kind: 'duration', days: 7 };
        case 'inAny':
        case 'inAll':
        case 'notIn':
            return { kind: 'stringList', values: [] };
        case 'eq':
        case 'neq':
            return { kind: 'string', value: '' };
        default:
            return { kind: 'string', value: '' };
    }
}
