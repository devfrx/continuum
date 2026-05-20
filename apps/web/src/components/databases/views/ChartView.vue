<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import type { PropertyDefinition } from '@continuum/shared';
import type { DatabaseViewSurfaceEmits, DatabaseViewSurfaceProps } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';
import ChartCanvas from './chart/ChartCanvas.vue';
import {
    aggregationLabel,
    buildChartBuckets,
    chartKindLabel,
    findGroupProperty,
    findValueProperty,
    formatChartValue,
    maxBucketValue,
    readChartAggregation,
    readChartKind,
    totalValue,
    type ChartBucket,
    type ChartKind,
} from './chart/chartData';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();

const { common } = useDatabaseRowDisplay(() => props.activeView);

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const chartKind = computed(() => readChartKind(layout.value));
const aggregation = computed(() => readChartAggregation(layout.value));
const groupProperty = computed(() => findGroupProperty(props.schema, layout.value));
const valueProperty = computed(() => findValueProperty(props.schema, aggregation.value, layout.value));
const buckets = computed<ChartBucket[]>(() => {
    if (!groupProperty.value) return [];
    return buildChartBuckets(props.rows, groupProperty.value, valueProperty.value, aggregation.value);
});

const chartTotal = computed(() => totalValue(buckets.value));
const chartMax = computed(() => maxBucketValue(buckets.value));
const bucketCount = computed(() => buckets.value.length);
const hasNumericRequirement = computed(() => aggregation.value !== 'count');
const hasRows = computed(() => props.rows.length > 0);
const visibleBuckets = computed(() => [...buckets.value].sort((a, b) => b.value - a.value));
const topBucket = computed(() => visibleBuckets.value.find((bucket) => bucket.rows > 0) ?? null);

const chartKindOptions: readonly { value: ChartKind; label: string }[] = [
    { value: 'bar', label: 'Bar' },
    { value: 'horizontalBar', label: 'Rows' },
    { value: 'line', label: 'Line' },
    { value: 'area', label: 'Area' },
    { value: 'pie', label: 'Pie' },
    { value: 'donut', label: 'Donut' },
];

const metricLabel = computed(() => {
    const base = aggregationLabel(aggregation.value);
    return aggregation.value === 'count' ? base : `${base} of ${valueProperty.value?.label ?? 'value'}`;
});

const primaryStat = computed(() => {
    if (aggregation.value === 'avg') return { label: 'Mean', value: meanOfBuckets(buckets.value) };
    if (aggregation.value === 'min') return { label: 'Lowest', value: minOfBuckets(buckets.value) };
    if (aggregation.value === 'max') return { label: 'Highest', value: chartMax.value };
    return { label: aggregation.value === 'count' ? 'Rows' : 'Total', value: chartTotal.value };
});

const groupLabel = computed(() => groupProperty.value?.label ?? 'Group');

const measureLabel = computed(() => {
    if (aggregation.value === 'count') return 'Rows';
    return valueProperty.value?.label ?? 'Value';
});

function setChartKind(kind: ChartKind): void {
    if (kind === chartKind.value) return;
    emit('view-config-changed', {
        layout: {
            ...layout.value,
            chartType: kind,
        },
    });
}

function percent(bucket: ChartBucket): string {
    if (chartTotal.value <= 0) return '0%';
    return `${Math.round((Math.max(0, bucket.value) / chartTotal.value) * 100)}%`;
}

function rowCountLabel(bucket: ChartBucket): string {
    if (aggregation.value === 'count') return `${bucket.rows} row${bucket.rows === 1 ? '' : 's'}`;
    return `${bucket.count} value${bucket.count === 1 ? '' : 's'}`;
}

function meanOfBuckets(items: readonly ChartBucket[]): number {
    const valued = items.filter((bucket) => bucket.count > 0);
    if (valued.length === 0) return 0;
    return valued.reduce((sum, bucket) => sum + bucket.value, 0) / valued.length;
}

function minOfBuckets(items: readonly ChartBucket[]): number {
    const valued = items.filter((bucket) => bucket.count > 0);
    if (valued.length === 0) return 0;
    return valued.reduce((min, bucket) => Math.min(min, bucket.value), valued[0]!.value);
}

function propertyLabel(property: PropertyDefinition | null): string {
    return property?.label ?? 'property';
}
</script>

<template>
    <div class="db-chart" :class="{ 'db-chart--wrap': common.wrapContent }">
        <div v-if="!groupProperty" class="db-chart__empty">
            <Icon name="view-chart" :size="24" />
            <h4>Chart needs a group property</h4>
            <p>Add a Select, Multi-select or Status property to split rows into series.</p>
        </div>

        <div v-else-if="hasNumericRequirement && !valueProperty" class="db-chart__empty">
            <Icon name="prop-number" :size="24" />
            <h4>Add a numeric property</h4>
            <p>{{ aggregationLabel(aggregation) }} charts need a Number property to measure.</p>
        </div>

        <div v-else-if="!hasRows" class="db-chart__empty">
            <Icon name="view-chart" :size="24" />
            <h4>No rows to chart</h4>
            <p>Add rows from a Table or List view to populate this chart.</p>
        </div>

        <template v-else>
            <header class="db-chart__header">
                <div class="db-chart__heading">
                    <span class="db-chart__heading-icon">
                        <Icon name="view-chart" :size="16" />
                    </span>
                    <div class="db-chart__heading-copy">
                        <span>Database chart</span>
                        <h4>{{ metricLabel }}</h4>
                        <p>{{ chartKindLabel(chartKind) }} by {{ propertyLabel(groupProperty) }}</p>
                    </div>
                </div>

                <div class="db-chart__type-switch" role="group" aria-label="Chart type">
                    <button
                        v-for="option in chartKindOptions"
                        :key="option.value"
                        type="button"
                        :class="{ 'is-active': option.value === chartKind }"
                        @click="setChartKind(option.value)">
                        {{ option.label }}
                    </button>
                </div>
            </header>

            <dl class="db-chart__stats">
                <div>
                    <dt>{{ primaryStat.label }}</dt>
                    <dd>{{ formatChartValue(primaryStat.value) }}</dd>
                </div>
                <div>
                    <dt>Group</dt>
                    <dd>{{ groupLabel }}</dd>
                </div>
                <div>
                    <dt>Measure</dt>
                    <dd>{{ measureLabel }}</dd>
                </div>
                <div>
                    <dt>Top</dt>
                    <dd>{{ topBucket?.label ?? 'None' }}</dd>
                </div>
            </dl>

            <section class="db-chart__content">
                <div class="db-chart__plot">
                    <div class="db-chart__plot-head">
                        <span>{{ bucketCount }} series</span>
                        <span>{{ formatChartValue(chartMax) }} max</span>
                    </div>
                    <ChartCanvas
                        :kind="chartKind"
                        :buckets="buckets"
                        :metric-label="metricLabel"
                        :total="chartTotal" />
                </div>

                <aside class="db-chart__legend" aria-label="Chart series">
                    <div class="db-chart__legend-head">
                        <span>Series</span>
                        <span>{{ metricLabel }}</span>
                    </div>
                    <ol>
                        <li v-for="bucket in visibleBuckets" :key="bucket.id">
                            <span class="db-chart__swatch" :style="{ background: bucket.color }" />
                            <span class="db-chart__legend-main">
                                <span class="db-chart__legend-label">{{ bucket.label }}</span>
                                <span class="db-chart__legend-meta">{{ rowCountLabel(bucket) }}</span>
                            </span>
                            <span class="db-chart__legend-value">
                                <strong>{{ formatChartValue(bucket.value) }}</strong>
                                <small>{{ percent(bucket) }}</small>
                            </span>
                        </li>
                    </ol>
                </aside>
            </section>
        </template>
    </div>
</template>

<style scoped>
.db-chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    padding: var(--space-4);
    color: var(--text-primary);
    font-size: var(--text-sm);
}

.db-chart__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
}

.db-chart__heading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
}

.db-chart__heading-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface-1));
    color: var(--accent);
}

.db-chart__heading-copy {
    min-width: 0;
}

.db-chart__heading-copy h4,
.db-chart__heading-copy p,
.db-chart__heading-copy span {
    margin: 0;
}

.db-chart__heading-copy span {
    display: block;
    margin-bottom: 2px;
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    text-transform: uppercase;
}

.db-chart__heading-copy h4 {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    line-height: var(--leading-tight);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-chart__heading-copy p {
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
}

.db-chart__type-switch {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
    padding: 2px;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
}

.db-chart__type-switch button {
    min-width: 0;
    height: 1.75rem;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: calc(var(--radius-sm) - 2px);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
    line-height: 1;
}

.db-chart__type-switch button:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
}

.db-chart__type-switch button.is-active {
    color: var(--text-primary);
    background: var(--surface-0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
}

.db-chart__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-2);
    margin: 0;
}

.db-chart__stats div {
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
}

.db-chart__stats dt,
.db-chart__stats dd {
    margin: 0;
}

.db-chart__stats dt {
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
}

.db-chart__stats dd {
    overflow: hidden;
    margin-top: 2px;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-chart__content {
    display: grid;
    grid-template-columns: minmax(300px, 1fr) minmax(220px, 300px);
    gap: var(--space-3);
    min-height: 340px;
}

.db-chart__plot {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    min-height: 340px;
    padding: var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    background:
        linear-gradient(180deg, color-mix(in srgb, var(--surface-2) 48%, transparent), transparent 42%),
        var(--surface-1);
}

.db-chart__plot-head {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
}

.db-chart__legend {
    min-width: 0;
    padding: var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-1);
}

.db-chart__legend-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    color: var(--text-muted);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
}

.db-chart__legend ol {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 318px;
    margin: 0;
    padding: 0;
    overflow: auto;
    list-style: none;
}

.db-chart__legend li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
}

.db-chart__legend li:hover {
    background: var(--surface-hover);
}

.db-chart__swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-sm);
}

.db-chart__legend-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.db-chart__legend-label {
    overflow: hidden;
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-chart__legend-meta {
    color: var(--text-muted);
    font-size: var(--text-2xs);
}

.db-chart__legend-value {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}

.db-chart__legend-value strong {
    color: var(--text-primary);
    font-size: var(--text-xs);
}

.db-chart__legend-value small {
    color: var(--text-muted);
    font-size: var(--text-2xs);
}

.db-chart__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 240px;
    padding: var(--space-6) var(--space-4);
    color: var(--text-muted);
    text-align: center;
}

.db-chart__empty h4,
.db-chart__empty p {
    margin: 0;
}

.db-chart__empty h4 {
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
}

.db-chart__empty p {
    max-width: 360px;
    line-height: var(--leading-normal);
}

@media (max-width: 860px) {
    .db-chart__header {
        flex-direction: column;
        align-items: stretch;
    }

    .db-chart__stats {
        width: 100%;
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .db-chart__type-switch {
        align-self: flex-start;
        max-width: 100%;
        overflow-x: auto;
    }

    .db-chart__content {
        grid-template-columns: 1fr;
    }
}
</style>
