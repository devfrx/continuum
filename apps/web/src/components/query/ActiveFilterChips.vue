<script setup lang="ts">
/**
 * ActiveFilterChips — read-only horizontal summary of every leaf
 * condition in a filter tree. Clicking a chip removes the matching
 * condition (the parent forwards the id to the filter builder).
 *
 * The summary is intentionally compact: `{field} {operator} {value}`.
 * Fields without a matching descriptor in the catalog (stale ids) fall
 * back to their raw key — better than crashing or hiding the chip.
 */
import { computed } from 'vue';
import {
    FILTER_OPERATORS,
    fieldRefKey,
    isFilterCondition,
    type FilterCondition,
    type FilterNode,
    type FilterValue,
} from '@continuum/shared';
import UiChip from '@/components/ui/UiChip.vue';
import { useFieldCatalog } from '@/composables/query/useFieldCatalog';

interface Props {
    filter: FilterNode;
    surface?: 'graph' | 'note';
}

const props = withDefaults(defineProps<Props>(), { surface: 'graph' });

const emit = defineEmits<{
    'remove-condition': [conditionId: string];
}>();

const catalog = useFieldCatalog();

// ───────── Tree → flat conditions list ─────────

function collect(node: FilterNode, out: FilterCondition[]): void {
    if (isFilterCondition(node)) {
        out.push(node);
        return;
    }
    for (const child of node.children) collect(child, out);
}

const conditions = computed<FilterCondition[]>(() => {
    const out: FilterCondition[] = [];
    collect(props.filter, out);
    return out;
});

// ───────── Per-chip label ─────────

function fieldLabel(c: FilterCondition): string {
    const key = fieldRefKey(c.field);
    const desc = catalog.fieldByKey(props.surface, key);
    return desc?.label ?? key;
}

function operatorLabel(c: FilterCondition): string {
    return FILTER_OPERATORS[c.operator]?.label ?? c.operator;
}

function valueLabel(value: FilterValue): string {
    switch (value.kind) {
        case 'none':
            return '';
        case 'string':
            return value.value || '∅';
        case 'number':
            return String(value.value);
        case 'numberRange':
            return `${value.from}–${value.to}`;
        case 'boolean':
            return value.value ? 'vero' : 'falso';
        case 'date':
            return value.value || '∅';
        case 'dateRange':
            return `${value.from || '∅'}–${value.to || '∅'}`;
        case 'duration':
            return `${value.days}g`;
        case 'stringList':
            if (value.values.length === 0) return '∅';
            if (value.values.length <= 2) return value.values.join(', ');
            return `${value.values.length} valori`;
    }
}

function chipLabel(c: FilterCondition): string {
    const v = valueLabel(c.value);
    const base = `${fieldLabel(c)} ${operatorLabel(c)}`;
    return v ? `${base} ${v}` : base;
}
</script>

<template>
    <div v-if="conditions.length > 0" class="active-chips" role="list">
        <UiChip
            v-for="c in conditions"
            :key="c.id"
            tone="accent"
            closable
            role="listitem"
            @close="emit('remove-condition', c.id)"
        >
            {{ chipLabel(c) }}
        </UiChip>
    </div>
</template>

<style scoped>
.active-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
}
</style>
