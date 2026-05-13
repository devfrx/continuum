<script setup lang="ts">
/**
 * FilterConditionRow — one leaf row in the filter tree.
 *
 * Layout: [Field picker] [Operator dropdown] [Value editor] [Delete]
 *
 * When the user picks a different field, the row auto-selects the first
 * operator from `field.operators` and emits a sensible default value
 * matching that operator's `valueKinds[0]`. This guarantees the parent
 * never sees an inconsistent (field × operator × value) triple.
 */
import { computed } from 'vue';
import {
    FILTER_OPERATORS,
    fieldRefKey,
    type FieldDescriptor,
    type FieldRef,
    type FilterCondition,
    type FilterOperatorId,
    type FilterValue,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { useFieldCatalog } from '@/composables/query/useFieldCatalog';
import FieldPicker from './FieldPicker.vue';
import FilterValueInput from './FilterValueInput.vue';
import { defaultFilterValueForField, valueKindForField } from './filterValueKinds';

interface Props {
    condition: FilterCondition;
    surface?: 'graph' | 'note';
}

const props = withDefaults(defineProps<Props>(), { surface: 'graph' });

const emit = defineEmits<{
    'update:condition': [c: FilterCondition];
    remove: [];
}>();

const catalog = useFieldCatalog();

// ───────── Field descriptor lookup ─────────

const fieldDescriptor = computed<FieldDescriptor | null>(() => {
    const key = fieldRefKey(props.condition.field);
    return catalog.fieldByKey(props.surface, key) ?? null;
});

// ───────── Operator menu ─────────

const operatorOptions = computed<{ label: string; value: string }[]>(() => {
    const desc = fieldDescriptor.value;
    if (!desc) return [];
    return desc.operators.map((id) => ({
        label: FILTER_OPERATORS[id].label,
        value: id,
    }));
});

// ───────── Handlers ─────────

function onFieldChange(next: FieldRef | null): void {
    if (!next) return;
    const nextKey = fieldRefKey(next);
    const nextDesc = catalog.fieldByKey(props.surface, nextKey);
    const nextOperator: FilterOperatorId =
        nextDesc?.operators[0] ?? props.condition.operator;
    emit('update:condition', {
        ...props.condition,
        field: next,
        operator: nextOperator,
        value: defaultFilterValueForField(nextDesc ?? null, nextOperator),
    });
}

function onOperatorChange(raw: string): void {
    const next = raw as FilterOperatorId;
    if (next === props.condition.operator) return;
    // Only reset the value when its kind changes — preserve user input
    // when switching between operators that take the same shape.
    const desc = fieldDescriptor.value;
    const prevKind = valueKindForField(desc, props.condition.operator);
    const nextKind = valueKindForField(desc, next);
    emit('update:condition', {
        ...props.condition,
        operator: next,
        value:
            prevKind === nextKind
                ? props.condition.value
                : defaultFilterValueForField(desc, next),
    });
}

function onValueChange(value: FilterValue): void {
    emit('update:condition', { ...props.condition, value });
}
</script>

<template>
    <div class="condition-row">
        <div class="condition-row__field">
            <FieldPicker
                :model-value="condition.field"
                :surface="surface"
                require-operators
                @update:model-value="onFieldChange"
            />
        </div>
        <div class="condition-row__operator">
            <UiSelect
                :model-value="condition.operator"
                :options="operatorOptions"
                placeholder="Operatore"
                :disabled="operatorOptions.length === 0"
                @update:model-value="onOperatorChange"
            />
        </div>
        <div class="condition-row__value">
            <FilterValueInput
                v-if="fieldDescriptor"
                :field="fieldDescriptor"
                :operator="condition.operator"
                :model-value="condition.value"
                @update:model-value="onValueChange"
            />
        </div>
        <button
            type="button"
            class="condition-row__delete"
            aria-label="Rimuovi condizione"
            title="Rimuovi condizione"
            @click="emit('remove')"
        >
            <Icon name="close" :size="12" />
        </button>
    </div>
</template>

<style scoped>
.condition-row {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr) minmax(0, 1.15fr) 24px;
    grid-template-areas: 'field operator value delete';
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
}

.condition-row__field,
.condition-row__operator,
.condition-row__value {
    min-width: 0;
}

.condition-row__field { grid-area: field; }
.condition-row__operator { grid-area: operator; }
.condition-row__value { grid-area: value; }
.condition-row__delete { grid-area: delete; }

.condition-row__operator :deep(.ui-select__trigger) {
    min-height: 32px;
    font-size: var(--text-sm);
}

.condition-row__operator :deep(.ui-select__value) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.condition-row__delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-subtle);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.condition-row__delete:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

@container (max-width: 520px) {
    .condition-row {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr) 24px;
        grid-template-areas:
            'field field delete'
            'operator value value';
    }
}

@container (max-width: 360px) {
    .condition-row {
        grid-template-columns: minmax(0, 1fr) 24px;
        grid-template-areas:
            'field delete'
            'operator operator'
            'value value';
    }
}
</style>
