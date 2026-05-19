/**
 * Helpers for table-header property actions.
 *
 * The header menu is a thin interaction layer; these helpers own the
 * persisted `DatabaseViewConfig` shapes so direct actions stay aligned
 * with the FilterPanel / SortPanel implementation.
 */
import { isFilterGroup } from '@continuum/shared';
import type {
    DatabaseViewConfig,
    FieldRef,
    FilterCondition,
    FilterGroup,
    FilterNode,
    FilterOperatorId,
    PropertyDefinition,
    SortDirection,
    SortRule,
} from '@continuum/shared';
import {
    defaultFilterValue,
    isSortableType,
    operatorsForType,
} from './filtering/operators';

export interface PropertyFilterAction {
    label: string;
    operator: FilterOperatorId;
}

function newClientId(prefix: 'f' | 's'): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function propertyField(propertyDefinition: PropertyDefinition): FieldRef {
    return { kind: 'property', key: propertyDefinition.key };
}

function isSamePropertyField(field: FieldRef, propertyDefinition: PropertyDefinition): boolean {
    return field.kind === 'property' && field.key === propertyDefinition.key;
}

function rootFilterGroup(filter: DatabaseViewConfig['filter'] | null | undefined): FilterGroup {
    if (filter && isFilterGroup(filter)) return filter;
    if (filter) {
        return { type: 'group', id: 'root', combinator: 'and', children: [filter] };
    }
    return { type: 'group', id: 'root', combinator: 'and', children: [] };
}

function withoutPropertyConditions(
    node: FilterNode,
    propertyDefinition: PropertyDefinition,
): FilterNode | null {
    if (node.type === 'condition') {
        return isSamePropertyField(node.field, propertyDefinition) ? null : node;
    }

    const children: FilterNode[] = [];
    for (const child of node.children) {
        const nextChild = withoutPropertyConditions(child, propertyDefinition);
        if (nextChild) children.push(nextChild);
    }
    return { ...node, children };
}

export function filterActionsForProperty(
    propertyDefinition: PropertyDefinition,
): PropertyFilterAction[] {
    const operators = operatorsForType(propertyDefinition.type);
    const actions: PropertyFilterAction[] = [];

    if (operators.includes('isNotEmpty')) {
        actions.push({ label: 'Filter not empty', operator: 'isNotEmpty' });
    }
    if (operators.includes('isEmpty')) {
        actions.push({ label: 'Filter empty', operator: 'isEmpty' });
    }
    if (operators.includes('isTrue')) {
        actions.push({ label: 'Filter checked', operator: 'isTrue' });
    }
    if (operators.includes('isFalse')) {
        actions.push({ label: 'Filter unchecked', operator: 'isFalse' });
    }

    return actions;
}

export function withPropertyFilter(
    currentFilter: DatabaseViewConfig['filter'] | null | undefined,
    propertyDefinition: PropertyDefinition,
    operator: FilterOperatorId,
): FilterGroup {
    const group = withoutPropertyFilter(currentFilter, propertyDefinition);
    const condition: FilterCondition = {
        type: 'condition',
        id: newClientId('f'),
        field: propertyField(propertyDefinition),
        operator,
        value: defaultFilterValue(operator),
    };

    return { ...group, children: [...group.children, condition] };
}

export function withoutPropertyFilter(
    currentFilter: DatabaseViewConfig['filter'] | null | undefined,
    propertyDefinition: PropertyDefinition,
): FilterGroup {
    const root = rootFilterGroup(currentFilter);
    const pruned = withoutPropertyConditions(root, propertyDefinition);
    return pruned && isFilterGroup(pruned)
        ? pruned
        : { type: 'group', id: root.id, combinator: root.combinator, children: [] };
}

export function canSortProperty(propertyDefinition: PropertyDefinition): boolean {
    return isSortableType(propertyDefinition.type);
}

export function withPropertySort(
    currentSort: readonly SortRule[] | null | undefined,
    propertyDefinition: PropertyDefinition,
    direction: SortDirection,
): SortRule[] {
    const rules = Array.isArray(currentSort) ? currentSort : [];
    const existing = rules.find((rule) => isSamePropertyField(rule.field, propertyDefinition));
    const nextRule: SortRule = {
        id: existing?.id ?? newClientId('s'),
        field: propertyField(propertyDefinition),
        direction,
    };

    return [
        nextRule,
        ...rules.filter((rule) => !isSamePropertyField(rule.field, propertyDefinition)),
    ];
}

export function withoutPropertySort(
    currentSort: readonly SortRule[] | null | undefined,
    propertyDefinition: PropertyDefinition,
): SortRule[] {
    const rules = Array.isArray(currentSort) ? currentSort : [];
    return rules.filter((rule) => !isSamePropertyField(rule.field, propertyDefinition));
}