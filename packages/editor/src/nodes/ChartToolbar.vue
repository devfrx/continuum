<script setup lang="ts">
/**
 * ChartToolbar — kind picker, options toggles and action buttons for a
 * chart block. Stays presentational: emits intents, never mutates the
 * node itself (the parent NodeView owns persistence).
 *
 * The kind picker uses the host application's themed select component
 * (passed as a prop) when available, falling back to a native `<select>`
 * so the editor remains usable in standalone embeddings.
 */
import { computed, type Component } from 'vue';
import { CHART_KINDS, type ChartKind, type ChartOptions } from './chartTypes';

const props = defineProps<{
    kind: ChartKind;
    options: ChartOptions;
    selectComponent: Component | null;
    editing: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:kind', value: ChartKind): void;
    (e: 'update:options', value: Partial<ChartOptions>): void;
    (e: 'toggle-edit'): void;
    (e: 'remove'): void;
}>();

const kindOptions = computed(() => CHART_KINDS);

function onKindNative(ev: Event): void {
    emit('update:kind', (ev.target as HTMLSelectElement).value as ChartKind);
}

function toggleLegend(): void {
    emit('update:options', { showLegend: !(props.options.showLegend !== false) });
}

function toggleGrid(): void {
    emit('update:options', { showGrid: !(props.options.showGrid !== false) });
}
</script>

<template>
    <div class="continuum-chart__toolbar">
        <component v-if="selectComponent" :is="selectComponent" :model-value="kind" :options="kindOptions"
            variant="bare" size="sm" aria-label="Chart kind"
            @update:model-value="(v: string) => emit('update:kind', v as ChartKind)" />
        <select v-else class="continuum-chart__select" :value="kind" aria-label="Chart kind" @change="onKindNative">
            <option v-for="opt in kindOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>

        <button type="button" class="continuum-chart__btn" :class="{ active: options.showLegend !== false }"
            :title="options.showLegend !== false ? 'Hide legend' : 'Show legend'" @click="toggleLegend">Legend</button>

        <button type="button" class="continuum-chart__btn" :class="{ active: options.showGrid !== false }"
            :title="options.showGrid !== false ? 'Hide grid' : 'Show grid'" @click="toggleGrid">Grid</button>

        <button type="button" class="continuum-chart__btn" :class="{ active: editing }"
            :title="editing ? 'Hide data editor' : 'Edit data'" @click="emit('toggle-edit')">{{ editing ? 'Done' :
            'Data' }}</button>

        <button type="button" class="continuum-chart__btn continuum-chart__btn--danger" title="Delete chart"
            @click="emit('remove')">Remove</button>
    </div>
</template>

<style scoped>
.continuum-chart__toolbar {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
}

.continuum-chart__select {
    appearance: none;
    background: var(--bg, transparent);
    color: var(--fg, inherit);
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-xs, 4px);
    padding: 2px 6px;
    font-size: var(--text-xs, 12px);
}

.continuum-chart__btn {
    appearance: none;
    background: transparent;
    color: var(--fg-muted, #666);
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-xs, 4px);
    padding: 2px 8px;
    font-size: var(--text-xs, 12px);
    cursor: pointer;
    transition: background-color var(--duration-fast, 120ms) var(--ease-standard, ease),
        color var(--duration-fast, 120ms) var(--ease-standard, ease);
}

.continuum-chart__btn:hover {
    background: var(--bg-elev, rgba(0, 0, 0, 0.04));
    color: var(--fg, inherit);
}

.continuum-chart__btn.active {
    background: var(--accent-soft, rgba(91, 141, 239, 0.15));
    color: var(--accent, #5b8def);
    border-color: var(--accent, #5b8def);
}

.continuum-chart__btn--danger:hover {
    background: var(--danger-soft, rgba(239, 68, 68, 0.12));
    color: var(--danger, #ef4444);
    border-color: var(--danger, #ef4444);
}
</style>
