<script setup lang="ts">
/**
 * FilterValueEditor.vue — input control for a single `FilterCondition.value`.
 *
 * The operator catalogue picks the value's `kind`; this component
 * mounts the right input for that kind so the panel stays declarative.
 * It is intentionally dumb: it never decides which operator a value
 * belongs to, and it never persists anything — the parent receives a
 * fresh `FilterValue` via `update:modelValue`.
 *
 * Special case: when `descriptor.type` is `select` / `multiSelect` /
 * `status` the string-based inputs become an option picker fed from
 * `descriptor.definition.config.options` so the user picks valid
 * option ids instead of typing them by hand.
 */
import { computed } from 'vue';
import { Icon, UiInput, UiSelect } from '@/components/ui';
import type { DatabaseFieldDescriptor, FilterValue } from '../filtering/types';

const props = defineProps<{
    modelValue: FilterValue;
    descriptor: DatabaseFieldDescriptor;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: FilterValue];
}>();

// ───────────────── Option-backed descriptors ─────────────────

interface OptionEntry {
    id: string;
    label: string;
}

const optionEntries = computed<OptionEntry[]>(() => {
    // Synthetic descriptors (e.g. the conditional-color field) carry
    // their options inline so the editor can render a real option
    // picker without a backing PropertyDefinition.
    if (props.descriptor.options && props.descriptor.options.length > 0) {
        return props.descriptor.options.map((o) => ({ id: o.id, label: o.label }));
    }
    const def = props.descriptor.definition;
    if (!def) return [];
    const config = def.config as { options?: Array<{ id: string; label: string }> } | undefined;
    return Array.isArray(config?.options) ? config!.options! : [];
});

const isOptionBacked = computed<boolean>(() => optionEntries.value.length > 0);

const optionSelectItems = computed(() =>
    optionEntries.value.map((o) => ({ value: o.id, label: o.label })),
);

// ───────────────── Update helpers ─────────────────

function update(next: FilterValue): void {
    emit('update:modelValue', next);
}

function onString(value: string): void {
    update({ kind: 'string', value });
}

function onNumber(value: string): void {
    const n = Number(value);
    update({ kind: 'number', value: Number.isFinite(n) ? n : 0 });
}

function onNumberRangeFrom(value: string): void {
    if (props.modelValue.kind !== 'numberRange') return;
    const n = Number(value);
    update({ ...props.modelValue, from: Number.isFinite(n) ? n : 0 });
}

function onNumberRangeTo(value: string): void {
    if (props.modelValue.kind !== 'numberRange') return;
    const n = Number(value);
    update({ ...props.modelValue, to: Number.isFinite(n) ? n : 0 });
}

function onDate(value: string): void {
    update({ kind: 'date', value });
}

function onDateRangeFrom(value: string): void {
    if (props.modelValue.kind !== 'dateRange') return;
    update({ ...props.modelValue, from: value });
}

function onDateRangeTo(value: string): void {
    if (props.modelValue.kind !== 'dateRange') return;
    update({ ...props.modelValue, to: value });
}

function onDuration(value: string): void {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    update({ kind: 'duration', days: n });
}

function toggleOptionInList(id: string): void {
    const current = props.modelValue.kind === 'stringList' ? props.modelValue.values : [];
    const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
    update({ kind: 'stringList', values: next });
}

function setSingleOption(id: string): void {
    if (props.modelValue.kind === 'stringList') {
        update({ kind: 'stringList', values: id ? [id] : [] });
    } else {
        update({ kind: 'string', value: id });
    }
}

function onTagInputEnter(event: KeyboardEvent): void {
    const target = event.target as HTMLInputElement;
    const value = target.value.trim();
    if (!value) return;
    toggleOptionInList(value);
    target.value = '';
}

// ───────────────── View helpers ─────────────────

const stringListValues = computed<string[]>(() =>
    props.modelValue.kind === 'stringList' ? props.modelValue.values : [],
);

const singleOptionValue = computed<string>(() => {
    if (props.modelValue.kind === 'stringList') return props.modelValue.values[0] ?? '';
    if (props.modelValue.kind === 'string') return props.modelValue.value;
    return '';
});
</script>

<template>
    <div class="fv-editor">
        <!-- Unary operators carry no value. -->
        <span v-if="modelValue.kind === 'none'" class="fv-editor__hint">No value required</span>

        <!-- Option-backed (select / status / multiSelect): single picker. -->
        <UiSelect
            v-else-if="isOptionBacked && (modelValue.kind === 'string')"
            :model-value="singleOptionValue"
            :options="optionSelectItems"
            placeholder="Pick an option"
            @update:model-value="(v) => setSingleOption(String(v))" />

        <!-- Option-backed multi-pick. -->
        <div
            v-else-if="isOptionBacked && modelValue.kind === 'stringList'"
            class="fv-editor__chips">
            <button
                v-for="opt in optionEntries"
                :key="opt.id"
                type="button"
                class="fv-editor__chip"
                :class="{ 'is-active': stringListValues.includes(opt.id) }"
                @click="toggleOptionInList(opt.id)">
                <Icon v-if="stringListValues.includes(opt.id)" name="check" :size="12" />
                <span>{{ opt.label }}</span>
            </button>
        </div>

        <!-- Plain text. -->
        <UiInput
            v-else-if="modelValue.kind === 'string'"
            :model-value="modelValue.value"
            placeholder="Value"
            @update:model-value="(v) => onString(String(v))" />

        <!-- Number. -->
        <UiInput
            v-else-if="modelValue.kind === 'number'"
            type="number"
            :model-value="String(modelValue.value)"
            @update:model-value="(v) => onNumber(String(v))" />

        <!-- Number range. -->
        <div v-else-if="modelValue.kind === 'numberRange'" class="fv-editor__range">
            <UiInput
                type="number"
                :model-value="String(modelValue.from)"
                placeholder="From"
                @update:model-value="(v) => onNumberRangeFrom(String(v))" />
            <span class="fv-editor__sep">–</span>
            <UiInput
                type="number"
                :model-value="String(modelValue.to)"
                placeholder="To"
                @update:model-value="(v) => onNumberRangeTo(String(v))" />
        </div>

        <!-- Date. -->
        <UiInput
            v-else-if="modelValue.kind === 'date'"
            type="date"
            :model-value="modelValue.value"
            @update:model-value="(v) => onDate(String(v))" />

        <!-- Date range. -->
        <div v-else-if="modelValue.kind === 'dateRange'" class="fv-editor__range">
            <UiInput
                type="date"
                :model-value="modelValue.from"
                @update:model-value="(v) => onDateRangeFrom(String(v))" />
            <span class="fv-editor__sep">–</span>
            <UiInput
                type="date"
                :model-value="modelValue.to"
                @update:model-value="(v) => onDateRangeTo(String(v))" />
        </div>

        <!-- Duration in days. -->
        <div v-else-if="modelValue.kind === 'duration'" class="fv-editor__duration">
            <UiInput
                type="number"
                :model-value="String(modelValue.days)"
                @update:model-value="(v) => onDuration(String(v))" />
            <span class="fv-editor__hint">days</span>
        </div>

        <!-- Free-text multi-select fallback when no options are configured. -->
        <div
            v-else-if="modelValue.kind === 'stringList'"
            class="fv-editor__chips">
            <span
                v-for="(tag, i) in stringListValues"
                :key="`${tag}-${i}`"
                class="fv-editor__chip is-active">
                <span>{{ tag }}</span>
                <button
                    type="button"
                    class="fv-editor__chip-remove"
                    aria-label="Remove"
                    @click="toggleOptionInList(tag)">
                    <Icon name="close" :size="10" />
                </button>
            </span>
            <input
                type="text"
                class="fv-editor__tag-input"
                placeholder="Add value, press Enter"
                @keydown.enter.prevent="onTagInputEnter" />
        </div>
    </div>
</template>

<style scoped>
.fv-editor {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    width: 100%;
}

.fv-editor__hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-style: italic;
}

.fv-editor__range,
.fv-editor__duration {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    width: 100%;
}

.fv-editor__sep {
    color: var(--text-muted);
    font-size: var(--text-xs);
}

.fv-editor__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    min-width: 0;
    width: 100%;
}

.fv-editor__chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    border: var(--border-width-1) solid var(--border);
    background: var(--surface-2);
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.fv-editor__chip:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
}

.fv-editor__chip.is-active {
    background: var(--accent-faint);
    border-color: var(--accent);
    color: var(--accent);
}

.fv-editor__chip-remove {
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
    padding: 0;
    display: inline-flex;
    align-items: center;
}

.fv-editor__tag-input {
    flex: 1 1 80px;
    min-width: 80px;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
    transition: border-color var(--duration-fast) var(--ease-standard);
}

.fv-editor__tag-input:focus {
    outline: none;
    border-color: var(--accent);
}
</style>
