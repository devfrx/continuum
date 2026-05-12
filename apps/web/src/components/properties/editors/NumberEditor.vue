<script setup lang="ts">
/**
 * Number property editor. Optional unit suffix shown inline.
 */
import { computed, ref, watch } from 'vue';
import { PROPERTY_TYPE_PLACEHOLDERS, type NumberValue, type PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: NumberValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: NumberValue] }>();

const cfg = computed(
    () =>
        props.definition.config as {
            unit?: string;
            precision?: number;
            min?: number;
            max?: number;
        },
);

function format(n: number | undefined): string {
    if (n === undefined || Number.isNaN(n)) return '';
    if (cfg.value.precision !== undefined) return n.toFixed(cfg.value.precision);
    return String(n);
}

const draft = ref<string>(format(props.value?.value));

watch(
    () => props.value?.value,
    (n) => {
        // Avoid clobbering the user's in-progress input when our local value
        // round-trips back through the API.
        const formatted = format(n);
        if (formatted !== draft.value && document.activeElement !== input.value) {
            draft.value = formatted;
        }
    },
);

const input = ref<HTMLInputElement | null>(null);

function commit(): void {
    if (!draft.value.trim()) {
        emit('update:value', { type: 'number', value: 0 });
        return;
    }
    const parsed = Number(draft.value);
    if (!Number.isFinite(parsed)) {
        draft.value = format(props.value?.value);
        return;
    }
    let v = parsed;
    if (cfg.value.min !== undefined) v = Math.max(cfg.value.min, v);
    if (cfg.value.max !== undefined) v = Math.min(cfg.value.max, v);
    emit('update:value', { type: 'number', value: v });
}

function onInput(e: Event): void {
    draft.value = (e.target as HTMLInputElement).value;
}
</script>

<template>
    <div class="prop-num">
        <input ref="input" class="prop-num__input" type="text" inputmode="decimal" :value="draft"
            :placeholder="PROPERTY_TYPE_PLACEHOLDERS.number" @input="onInput" @blur="commit"
            @keydown.enter.prevent="commit" />
        <span v-if="cfg.unit" class="prop-num__unit">{{ cfg.unit }}</span>
    </div>
</template>

<style scoped>
.prop-num {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-num:hover,
.prop-num:focus-within {
    background: var(--bg-soft);
}

.prop-num__input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
}

.prop-num__input::placeholder {
    color: var(--fg-subtle);
}

.prop-num__unit {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}
</style>
