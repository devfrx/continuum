<script setup lang="ts">
/**
 * ChartLayoutSettings.vue — knobs specific to the Chart renderer.
 *
 * Mirrors `ChartView.vue` consumption from `config.layout`:
 *   – `chartType`            `'bar'` (default) | `'pie'` | `'donut'`
 *   – `groupByPropertyId`    select / multi-select / status property
 *   – `aggregation`          `'count'` (default) | `'sum'` | `'avg'`
 *   – `valuePropertyId`      numeric property — required for `sum` / `avg`
 *
 * The value-property picker only renders when the chosen aggregation
 * actually consumes one, keeping the surface uncluttered for the
 * default `count` mode.
 */
import { computed } from 'vue';
import { UiSelect } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import { isBoardGroupable } from '../../views/boardGrouping';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

// ── Group-by property (select / multiSelect / status) ───────────────────

const groupable = computed(() => props.schema.filter(isBoardGroupable));

const groupByPropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { groupByPropertyId?: unknown } | null | undefined)
        ?.groupByPropertyId;
    if (typeof v === 'string' && groupable.value.some((p) => p.id === v)) return v;
    return groupable.value[0]?.id ?? '';
});

const groupOptions = computed(() =>
    groupable.value.map((p) => ({ value: p.id, label: p.label })),
);

// ── Chart shape & aggregation ───────────────────────────────────────────

const chartType = computed<string>(() => {
    const v = (props.view.config.layout as { chartType?: unknown } | null | undefined)?.chartType;
    return v === 'pie' || v === 'donut' ? v : 'bar';
});

const aggregation = computed<string>(() => {
    const v = (props.view.config.layout as { aggregation?: unknown } | null | undefined)?.aggregation;
    return v === 'sum' || v === 'avg' ? v : 'count';
});

const CHART_OPTIONS = [
    { value: 'bar', label: 'Bar' },
    { value: 'pie', label: 'Pie' },
    { value: 'donut', label: 'Donut' },
];

const AGG_OPTIONS = [
    { value: 'count', label: 'Count rows' },
    { value: 'sum', label: 'Sum of…' },
    { value: 'avg', label: 'Average of…' },
];

// ── Value property (only for sum / avg) ─────────────────────────────────

const numericProperties = computed(() => props.schema.filter((p) => p.type === 'number'));

const valuePropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { valuePropertyId?: unknown } | null | undefined)
        ?.valuePropertyId;
    if (typeof v === 'string' && numericProperties.value.some((p) => p.id === v)) return v;
    return numericProperties.value[0]?.id ?? '';
});

const valueOptions = computed(() =>
    numericProperties.value.map((p) => ({ value: p.id, label: p.label })),
);

const needsValueProperty = computed(() => aggregation.value !== 'count');

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <div class="chart-layout">
        <div v-if="groupable.length === 0" class="chart-layout__hint">
            Add a <strong>select</strong>, <strong>multi-select</strong> or <strong>status</strong>
            property to group the chart.
        </div>
        <template v-else>
            <div class="chart-layout__row chart-layout__row--stack">
                <span class="chart-layout__label">Chart type</span>
                <UiSelect
                    :model-value="chartType"
                    :options="CHART_OPTIONS"
                    aria-label="Chart type"
                    @update:model-value="(v) => patch({ chartType: String(v) })" />
            </div>
            <div class="chart-layout__row chart-layout__row--stack">
                <span class="chart-layout__label">Group by</span>
                <UiSelect
                    :model-value="groupByPropertyId"
                    :options="groupOptions"
                    aria-label="Group-by property"
                    @update:model-value="(v) => patch({ groupByPropertyId: String(v) })" />
            </div>
            <div class="chart-layout__row chart-layout__row--stack">
                <span class="chart-layout__label">Aggregation</span>
                <UiSelect
                    :model-value="aggregation"
                    :options="AGG_OPTIONS"
                    aria-label="Aggregation"
                    @update:model-value="(v) => patch({ aggregation: String(v) })" />
            </div>
            <div v-if="needsValueProperty" class="chart-layout__row chart-layout__row--stack">
                <span class="chart-layout__label">Value property</span>
                <div v-if="numericProperties.length === 0" class="chart-layout__hint">
                    Add a <strong>number</strong> property to enable sum or average.
                </div>
                <UiSelect
                    v-else
                    :model-value="valuePropertyId"
                    :options="valueOptions"
                    aria-label="Value property"
                    @update:model-value="(v) => patch({ valuePropertyId: String(v) })" />
            </div>
        </template>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.chart-layout {
    display: flex;
    flex-direction: column;
}

.chart-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.chart-layout__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.chart-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.chart-layout__hint {
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
}
</style>
