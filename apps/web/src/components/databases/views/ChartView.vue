<script setup lang="ts">
/**
 * ChartView.vue — lightweight aggregate visualizer.
 *
 * The renderer groups rows by an option-bearing property (select,
 * multi-select or status — same set as `BoardView`) and aggregates a
 * metric per bucket. Three chart shapes are supported with pure CSS,
 * keeping the bundle library-free:
 *   – `bar`    horizontal bars with bucket label + numeric value
 *   – `pie`    classic pie via `conic-gradient`
 *   – `donut`  same as pie with a centered hole
 *
 * Aggregations:
 *   – `count`  number of rows in the bucket (default)
 *   – `sum`    sum of `valuePropertyId` (a numeric property)
 *   – `avg`    arithmetic mean of `valuePropertyId`
 *
 * Multi-select rows participate in *every* bucket whose option id they
 * carry (consistent with Board's column logic via `readSelectedOptionIds`).
 * Rows with no value land in the synthetic "No value" bucket.
 */
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyOption,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';
import { isBoardGroupable, readSelectedOptionIds } from './boardGrouping';

const props = defineProps<DatabaseViewSurfaceProps>();
// Chart is read-only — declared for contract parity with other view surfaces.
defineEmits<DatabaseViewSurfaceEmits>();
const { common } = useDatabaseRowDisplay(() => props.activeView);

// ── Configuration ────────────────────────────────────────────────────────

type ChartType = 'bar' | 'pie' | 'donut';
type Aggregation = 'count' | 'sum' | 'avg';

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const chartType = computed<ChartType>(() => {
    const v = layout.value.chartType;
    return v === 'pie' || v === 'donut' ? v : 'bar';
});

const aggregation = computed<Aggregation>(() => {
    const v = layout.value.aggregation;
    return v === 'sum' || v === 'avg' ? v : 'count';
});

const explicitGroupId = computed<string | null>(() =>
    typeof layout.value.groupByPropertyId === 'string' ? layout.value.groupByPropertyId : null,
);

const groupProperty = computed<PropertyDefinition | null>(() => {
    const explicit = explicitGroupId.value;
    if (explicit) {
        const def = props.schema.find((p) => p.id === explicit);
        if (def && isBoardGroupable(def)) return def;
    }
    return props.schema.find(isBoardGroupable) ?? null;
});

const explicitValueId = computed<string | null>(() =>
    typeof layout.value.valuePropertyId === 'string' ? layout.value.valuePropertyId : null,
);

const valueProperty = computed<PropertyDefinition | null>(() => {
    if (aggregation.value === 'count') return null;
    const numeric = props.schema.filter((p) => p.type === 'number');
    const explicit = explicitValueId.value;
    if (explicit) {
        const def = numeric.find((p) => p.id === explicit);
        if (def) return def;
    }
    return numeric[0] ?? null;
});

// ── Bucketing ────────────────────────────────────────────────────────────

interface Bucket {
    id: string;
    label: string;
    color: string;
    /** Aggregate value rendered as a bar / slice. */
    value: number;
    /** Bookkeeping for `avg`. */
    count: number;
}

const NONE = '__none__';
const PALETTE = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
    '#84cc16', '#f97316', '#ec4899', '#14b8a6', '#a855f7', '#3b82f6',
];

function rowNumber(row: DatabaseRowSnapshot, def: PropertyDefinition | null): number | null {
    if (!def) return null;
    const value = row.properties.find((p) => p.definition.id === def.id)?.value;
    if (!value || value.type !== 'number') return null;
    return Number.isFinite(value.value) ? value.value : null;
}

const buckets = computed<Bucket[]>(() => {
    const groupDef = groupProperty.value;
    if (!groupDef) return [];
    const cfg = (groupDef.config ?? {}) as { options?: PropertyOption[] };
    const options = cfg.options ?? [];
    const byId = new Map<string, Bucket>();
    options.forEach((opt, i) =>
        byId.set(opt.id, {
            id: opt.id,
            label: opt.label,
            color: opt.color || PALETTE[i % PALETTE.length],
            value: 0,
            count: 0,
        }),
    );
    byId.set(NONE, {
        id: NONE,
        label: 'No value',
        color: 'rgba(255, 255, 255, 0.18)',
        value: 0,
        count: 0,
    });

    const valDef = valueProperty.value;
    for (const row of props.rows) {
        const entry = row.properties.find((p) => p.definition.id === groupDef.id);
        const ids = readSelectedOptionIds(entry?.value);
        const targets = ids.length ? ids : [NONE];
        const contribution = aggregation.value === 'count'
            ? 1
            : rowNumber(row, valDef) ?? 0;
        for (const id of targets) {
            const bucket = byId.get(id);
            if (!bucket) continue;
            bucket.value += contribution;
            bucket.count += 1;
        }
    }

    if (aggregation.value === 'avg') {
        for (const b of byId.values()) b.value = b.count ? b.value / b.count : 0;
    }

    // Stable order: schema option order first, "No value" last.
    const ordered: Bucket[] = [];
    for (const opt of options) {
        const b = byId.get(opt.id);
        if (b) ordered.push(b);
    }
    const none = byId.get(NONE);
    if (none && none.count > 0) ordered.push(none);
    return ordered;
});

const total = computed(() => buckets.value.reduce((sum, b) => sum + Math.max(0, b.value), 0));
const maxValue = computed(() => buckets.value.reduce((m, b) => Math.max(m, b.value), 0));

/** Build the `conic-gradient` background for pie / donut charts. */
const pieGradient = computed<string>(() => {
    if (total.value <= 0) return 'conic-gradient(rgba(255, 255, 255, 0.08) 0 360deg)';
    const stops: string[] = [];
    let cursor = 0;
    for (const b of buckets.value) {
        const slice = (Math.max(0, b.value) / total.value) * 360;
        if (slice <= 0) continue;
        stops.push(`${b.color} ${cursor}deg ${cursor + slice}deg`);
        cursor += slice;
    }
    return `conic-gradient(${stops.join(', ')})`;
});

function barWidth(value: number): string {
    if (maxValue.value <= 0) return '0%';
    return `${Math.max(0, Math.min(100, (value / maxValue.value) * 100))}%`;
}

function fmt(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}
</script>

<template>
    <div class="db-chart" :class="{ 'db-chart--wrap': common.wrapContent }">
        <div v-if="!groupProperty" class="db-chart__empty">
            <Icon name="view-chart" :size="22" />
            <h4>Chart needs an option-based property</h4>
            <p>Add a <strong>Select</strong>, <strong>Multi-select</strong> or <strong>Status</strong>
                property to group the rows.</p>
        </div>
        <div
            v-else-if="aggregation !== 'count' && !valueProperty"
            class="db-chart__empty">
            <Icon name="view-chart" :size="22" />
            <h4>Add a numeric property</h4>
            <p>Sum and average aggregations need a <strong>Number</strong> property to add up.</p>
        </div>
        <template v-else>
            <header class="db-chart__head">
                <span class="db-chart__title">
                    {{ aggregation === 'count' ? 'Count' : `${aggregation === 'sum' ? 'Sum' : 'Avg'} of ${valueProperty?.label}` }}
                    · by {{ groupProperty.label }}
                </span>
            </header>

            <div v-if="chartType === 'bar'" class="db-chart__bars">
                <div v-for="b in buckets" :key="b.id" class="db-chart__bar-row">
                    <span class="db-chart__bar-label">
                        <span class="db-chart__swatch" :style="{ background: b.color }" />
                        {{ b.label }}
                    </span>
                    <div class="db-chart__bar-track">
                        <div class="db-chart__bar-fill" :style="{ width: barWidth(b.value), background: b.color }" />
                    </div>
                    <span class="db-chart__bar-value">{{ fmt(b.value) }}</span>
                </div>
            </div>

            <div v-else class="db-chart__pie-wrap">
                <div
                    class="db-chart__pie"
                    :class="{ 'db-chart__pie--donut': chartType === 'donut' }"
                    :style="{ background: pieGradient }" />
                <ol class="db-chart__legend">
                    <li v-for="b in buckets" :key="b.id">
                        <span class="db-chart__swatch" :style="{ background: b.color }" />
                        <span class="db-chart__legend-label">{{ b.label }}</span>
                        <span class="db-chart__legend-value">{{ fmt(b.value) }}</span>
                    </li>
                </ol>
            </div>
        </template>
    </div>
</template>

<style scoped>
.db-chart {
    display: flex;
    flex-direction: column;
    padding: 0.75rem 1rem;
    color: var(--fg, #ededed);
    font-size: 0.78rem;
    min-height: 0;
}

.db-chart__head {
    margin-bottom: 0.6rem;
}

.db-chart__title {
    color: var(--fg-muted, #a09b90);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

/* ── Bar chart ────────────────────────────────────────────────────── */

.db-chart__bars {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    max-width: 720px;
}

.db-chart__bar-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) 3fr auto;
    align-items: center;
    gap: 0.6rem;
}

.db-chart__bar-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--fg, #ededed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-chart__swatch {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-sm);
    flex: 0 0 auto;
}

.db-chart__bar-track {
    height: 12px;
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
}

.db-chart__bar-fill {
    height: 100%;
    border-radius: var(--radius-sm);
    transition: width 120ms ease;
}

.db-chart__bar-value {
    color: var(--fg, #ededed);
    font-variant-numeric: tabular-nums;
    min-width: 2ch;
    text-align: right;
}

/* ── Pie / donut ──────────────────────────────────────────────────── */

.db-chart__pie-wrap {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex-wrap: wrap;
}

.db-chart__pie {
    width: 200px;
    height: 200px;
    border-radius: var(--radius-sm);
    flex: 0 0 auto;
}

.db-chart__pie--donut {
    -webkit-mask: radial-gradient(circle, transparent 38%, #000 39%);
            mask: radial-gradient(circle, transparent 38%, #000 39%);
}

.db-chart__legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 180px;
}

.db-chart__legend li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.4rem;
}

.db-chart__legend-label {
    color: var(--fg, #ededed);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-chart__legend-value {
    color: var(--fg-muted, #a09b90);
    font-variant-numeric: tabular-nums;
}

/* ── Empty state ──────────────────────────────────────────────────── */

.db-chart__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 2rem 1rem;
    text-align: center;
    color: var(--fg-muted, #a09b90);
}

.db-chart__empty h4 {
    margin: 0.3rem 0 0;
    color: var(--fg, #ededed);
    font-size: 0.95rem;
}

.db-chart__empty p {
    margin: 0;
    max-width: 320px;
}
</style>
