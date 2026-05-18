<script setup lang="ts">
/**
 * FilterPanel.vue — "Filter" section of the view-options popover.
 *
 * Renders the active view's `FilterNode` tree as a flat list of
 * conditions joined by a single root combinator (and / or). This
 * matches the Graph 2d filter UX and keeps the database-view filter
 * easy to read at a glance; nested groups can be added later without
 * breaking the persisted shape (which already supports them).
 *
 * Each condition exposes:
 *   – field picker (title + every property),
 *   – operator picker (filtered by `operatorsForType`),
 *   – value editor (delegates to `FilterValueEditor.vue`),
 *   – remove button.
 *
 * Patches are emitted as `patch-config { filter: FilterNode }`. The
 * root `FilterGroup` is always provided — when the user clears the
 * last condition we still send an empty group so the persisted shape
 * stays valid.
 */
import { computed } from 'vue';
import { Icon, UiSelect, UiSegmented, UiButton, UiEmpty } from '@/components/ui';
import type {
    DatabaseView,
    DatabaseViewConfig,
    FieldRef,
    PropertyDefinition,
} from '@continuum/shared';
import { FILTER_OPERATORS, isFilterGroup } from '@continuum/shared';
import {
    defaultFilterValue,
    describeFields,
    operatorsForType,
} from '../filtering/operators';
import type {
    DatabaseFieldDescriptor,
    FilterCondition,
    FilterGroup,
    FilterNode,
    FilterOperatorId,
} from '../filtering/types';
import { TITLE_FIELD_ID } from '../filtering/types';
import FilterValueEditor from './FilterValueEditor.vue';

const props = defineProps<{
    view: DatabaseView;
    schema: readonly PropertyDefinition[];
}>();

const emit = defineEmits<{
    'patch-config': [patch: Partial<DatabaseViewConfig>];
}>();

// ───────────────── Field catalogue ─────────────────

const fields = computed<DatabaseFieldDescriptor[]>(() => describeFields(props.schema));

const fieldOptions = computed(() =>
    fields.value.map((f) => ({ value: f.id, label: f.label })),
);

// ───────────────── Root group (always a group, ever) ─────────────────

const rootGroup = computed<FilterGroup>(() => {
    const raw = props.view.config.filter;
    if (raw && isFilterGroup(raw)) return raw;
    if (raw) {
        // Persisted as a bare condition — wrap so the rest of the panel
        // can assume a group at the root.
        return { type: 'group', id: 'root', combinator: 'and', children: [raw] };
    }
    return { type: 'group', id: 'root', combinator: 'and', children: [] };
});

const conditions = computed<FilterCondition[]>(() =>
    rootGroup.value.children.filter(
        (child): child is FilterCondition => child.type === 'condition',
    ),
);

const combinatorOptions = [
    { value: 'and', label: 'All' },
    { value: 'or', label: 'Any' },
] as const;

// ───────────────── Field <-> FieldRef helpers ─────────────────

function fieldRefOf(descriptor: DatabaseFieldDescriptor): FieldRef {
    if (descriptor.id === TITLE_FIELD_ID) {
        return { kind: 'system', id: 'note.title' };
    }
    return { kind: 'property', key: descriptor.definition!.key };
}

function descriptorOfRef(ref: FieldRef): DatabaseFieldDescriptor | null {
    if (ref.kind === 'system' && ref.id === 'note.title') {
        return fields.value.find((f) => f.id === TITLE_FIELD_ID) ?? null;
    }
    if (ref.kind === 'property') {
        const key = ref.key;
        const def = props.schema.find((d) => d.key === key);
        if (!def) return null;
        return fields.value.find((f) => f.id === def.id) ?? null;
    }
    return null;
}

/**
 * Template-safe descriptor lookup. Returns the matching descriptor when
 * the field reference resolves, otherwise a stable fallback (the title
 * pseudo-field) so the value editor never receives `null`.
 */
function descriptorOfRefSafe(ref: FieldRef): DatabaseFieldDescriptor {
    const found = descriptorOfRef(ref);
    if (found) return found;
    return fields.value[0] ?? {
        id: TITLE_FIELD_ID,
        label: 'Title',
        type: 'text',
        operators: [],
        definition: null,
    };
}

function operatorLabel(id: FilterOperatorId): string {
    return FILTER_OPERATORS[id]?.label ?? id;
}

function operatorOptionsFor(descriptor: DatabaseFieldDescriptor | null) {
    const ops = descriptor ? operatorsForType(descriptor.type) : operatorsForType('text');
    return ops.map((op) => ({ value: op, label: operatorLabel(op) }));
}

function newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ───────────────── Patch emitters ─────────────────

function emitGroup(children: FilterNode[], combinator?: 'and' | 'or'): void {
    const next: FilterGroup = {
        type: 'group',
        id: rootGroup.value.id,
        combinator: combinator ?? rootGroup.value.combinator,
        children,
    };
    emit('patch-config', { filter: next });
}

function setCombinator(value: string): void {
    if (value !== 'and' && value !== 'or') return;
    if (value === rootGroup.value.combinator) return;
    emitGroup(rootGroup.value.children, value);
}

function addCondition(): void {
    const descriptor = fields.value[0];
    if (!descriptor) return;
    const ops = operatorsForType(descriptor.type);
    const op = ops[0] ?? 'isEmpty';
    const condition: FilterCondition = {
        type: 'condition',
        id: newId(),
        field: fieldRefOf(descriptor),
        operator: op,
        value: defaultFilterValue(op),
    };
    emitGroup([...rootGroup.value.children, condition]);
}

function removeCondition(id: string): void {
    emitGroup(rootGroup.value.children.filter((c) => c.id !== id));
}

function clearAll(): void {
    if (conditions.value.length === 0) return;
    emitGroup([]);
}

function patchCondition(id: string, patch: Partial<FilterCondition>): void {
    const next = rootGroup.value.children.map((child) => {
        if (child.type !== 'condition' || child.id !== id) return child;
        return { ...child, ...patch } as FilterCondition;
    });
    emitGroup(next);
}

function onFieldChange(condition: FilterCondition, fieldId: string): void {
    const descriptor = fields.value.find((f) => f.id === fieldId);
    if (!descriptor) return;
    const ops = operatorsForType(descriptor.type);
    const nextOp: FilterOperatorId = ops.includes(condition.operator)
        ? condition.operator
        : (ops[0] ?? 'isEmpty');
    patchCondition(condition.id, {
        field: fieldRefOf(descriptor),
        operator: nextOp,
        value: defaultFilterValue(nextOp),
    });
}

function onOperatorChange(condition: FilterCondition, operator: string): void {
    const op = operator as FilterOperatorId;
    if (op === condition.operator) return;
    patchCondition(condition.id, {
        operator: op,
        value: defaultFilterValue(op),
    });
}
</script>

<template>
    <div class="filter-panel">
        <header v-if="conditions.length > 1" class="filter-panel__header">
            <span class="filter-panel__label">Match</span>
            <UiSegmented
                :model-value="rootGroup.combinator"
                :options="[...combinatorOptions]"
                @update:model-value="(v) => setCombinator(String(v))" />
            <span class="filter-panel__label">conditions</span>
            <button
                type="button"
                class="filter-panel__link"
                @click="clearAll">
                Clear all
            </button>
        </header>

        <ol v-if="conditions.length > 0" class="filter-panel__list">
            <li
                v-for="condition in conditions"
                :key="condition.id"
                class="filter-panel__row">
                <UiSelect
                    :model-value="descriptorOfRef(condition.field)?.id ?? ''"
                    :options="fieldOptions"
                    class="filter-panel__field"
                    @update:model-value="(v) => onFieldChange(condition, String(v))" />
                <UiSelect
                    :model-value="condition.operator"
                    :options="operatorOptionsFor(descriptorOfRef(condition.field))"
                    class="filter-panel__op"
                    @update:model-value="(v) => onOperatorChange(condition, String(v))" />
                <FilterValueEditor
                    v-if="descriptorOfRef(condition.field)"
                    :model-value="condition.value"
                    :descriptor="descriptorOfRefSafe(condition.field)"
                    class="filter-panel__value"
                    @update:model-value="(v) => patchCondition(condition.id, { value: v })" />
                <button
                    type="button"
                    class="filter-panel__remove"
                    aria-label="Remove filter"
                    @click="removeCondition(condition.id)">
                    <Icon name="close" :size="14" />
                </button>
            </li>
        </ol>

        <UiEmpty
            v-else
            compact
            title="No filters yet"
            description="Show only the rows that match the conditions you add here.">
            <template #icon>
                <Icon name="filter" :size="20" />
            </template>
        </UiEmpty>

        <UiButton
            variant="ghost"
            size="sm"
            :disabled="fields.length === 0"
            @click="addCondition">
            <Icon name="plus" :size="14" />
            <span>Add filter</span>
        </UiButton>
    </div>
</template>

<style scoped>
.filter-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.filter-panel__header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--text-muted);
}

.filter-panel__label {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
}

.filter-panel__link {
    margin-left: auto;
    background: none;
    border: 0;
    color: var(--text-secondary);
    font: inherit;
    font-size: var(--text-xs);
    text-transform: none;
    letter-spacing: 0;
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.filter-panel__link:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
}

.filter-panel__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.filter-panel__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr) auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color var(--duration-fast) var(--ease-standard);
}

.filter-panel__row:focus-within {
    border-color: var(--border-strong);
}

.filter-panel__field,
.filter-panel__op,
.filter-panel__value {
    min-width: 0;
}

.filter-panel__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: transparent;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.filter-panel__remove:hover {
    color: var(--danger);
    background: var(--danger-faint);
}
</style>
