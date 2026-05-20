import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyOption,
} from '@continuum/shared';
import { isBoardGroupable, readSelectedOptionIds } from '../boardGrouping';

export type ChartKind = 'bar' | 'horizontalBar' | 'line' | 'area' | 'pie' | 'donut' | 'polarArea';
export type ChartAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max';

export interface ChartBucket {
    id: string;
    label: string;
    color: string;
    value: number;
    rows: number;
    count: number;
}

interface MutableBucket extends ChartBucket {
    initialized: boolean;
}

const NONE = '__none__';
const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export const CHART_PALETTE = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
    '#84cc16', '#f97316', '#ec4899', '#14b8a6', '#a855f7', '#3b82f6',
];

export function readChartKind(layout: Record<string, unknown>): ChartKind {
    const value = layout.chartType;
    switch (value) {
        case 'horizontalBar':
        case 'line':
        case 'area':
        case 'pie':
        case 'donut':
        case 'polarArea':
            return value;
        default:
            return 'bar';
    }
}

export function readChartAggregation(layout: Record<string, unknown>): ChartAggregation {
    const value = layout.aggregation;
    switch (value) {
        case 'sum':
        case 'avg':
        case 'min':
        case 'max':
            return value;
        default:
            return 'count';
    }
}

export function findGroupProperty(
    schema: readonly PropertyDefinition[],
    layout: Record<string, unknown>,
): PropertyDefinition | null {
    const explicit = typeof layout.groupByPropertyId === 'string' ? layout.groupByPropertyId : null;
    if (explicit) {
        const definition = schema.find((property) => property.id === explicit);
        if (definition && isBoardGroupable(definition)) return definition;
    }
    return schema.find(isBoardGroupable) ?? null;
}

export function findValueProperty(
    schema: readonly PropertyDefinition[],
    aggregation: ChartAggregation,
    layout: Record<string, unknown>,
): PropertyDefinition | null {
    if (aggregation === 'count') return null;
    const numeric = schema.filter((property) => property.type === 'number');
    const explicit = typeof layout.valuePropertyId === 'string' ? layout.valuePropertyId : null;
    if (explicit) {
        const definition = numeric.find((property) => property.id === explicit);
        if (definition) return definition;
    }
    return numeric[0] ?? null;
}

export function buildChartBuckets(
    rows: readonly DatabaseRowSnapshot[],
    groupProperty: PropertyDefinition,
    valueProperty: PropertyDefinition | null,
    aggregation: ChartAggregation,
): ChartBucket[] {
    const options = (((groupProperty.config ?? {}) as { options?: PropertyOption[] }).options ?? []);
    const buckets = new Map<string, MutableBucket>();
    options.forEach((option, index) => {
        buckets.set(option.id, {
            id: option.id,
            label: option.label,
            color: option.color || CHART_PALETTE[index % CHART_PALETTE.length],
            value: 0,
            rows: 0,
            count: 0,
            initialized: false,
        });
    });
    buckets.set(NONE, {
        id: NONE,
        label: 'No value',
        color: 'rgba(255, 255, 255, 0.28)',
        value: 0,
        rows: 0,
        count: 0,
        initialized: false,
    });

    for (const row of rows) {
        const groupEntry = row.properties.find((property) => property.definition.id === groupProperty.id);
        const selectedIds = readSelectedOptionIds(groupEntry?.value);
        const targets = selectedIds.length > 0 ? selectedIds : [NONE];
        const numericValue = aggregation === 'count' ? null : rowNumber(row, valueProperty);

        for (const id of targets) {
            const bucket = buckets.get(id);
            if (!bucket) continue;
            bucket.rows += 1;
            applyContribution(bucket, numericValue, aggregation);
        }
    }

    if (aggregation === 'avg') {
        for (const bucket of buckets.values()) {
            bucket.value = bucket.count > 0 ? bucket.value / bucket.count : 0;
        }
    }

    const ordered: ChartBucket[] = [];
    for (const option of options) {
        const bucket = buckets.get(option.id);
        if (bucket) ordered.push(toBucket(bucket));
    }
    const empty = buckets.get(NONE);
    if (empty && empty.rows > 0) ordered.push(toBucket(empty));
    return ordered;
}

export function formatChartValue(value: number): string {
    if (!Number.isFinite(value)) return '0';
    return NUMBER_FORMAT.format(Math.round(value * 100) / 100);
}

export function chartKindLabel(kind: ChartKind): string {
    switch (kind) {
        case 'horizontalBar': return 'Horizontal bar';
        case 'line': return 'Line';
        case 'area': return 'Area';
        case 'pie': return 'Pie';
        case 'donut': return 'Donut';
        case 'polarArea': return 'Polar area';
        case 'bar': return 'Bar';
    }
}

export function aggregationLabel(aggregation: ChartAggregation): string {
    switch (aggregation) {
        case 'sum': return 'Sum';
        case 'avg': return 'Average';
        case 'min': return 'Minimum';
        case 'max': return 'Maximum';
        case 'count': return 'Count';
    }
}

export function totalValue(buckets: readonly ChartBucket[]): number {
    return buckets.reduce((sum, bucket) => sum + Math.max(0, bucket.value), 0);
}

export function maxBucketValue(buckets: readonly ChartBucket[]): number {
    return buckets.reduce((max, bucket) => Math.max(max, bucket.value), 0);
}

function rowNumber(row: DatabaseRowSnapshot, definition: PropertyDefinition | null): number | null {
    if (!definition) return null;
    const value = row.properties.find((property) => property.definition.id === definition.id)?.value;
    if (!value || value.type !== 'number') return null;
    return Number.isFinite(value.value) ? value.value : null;
}

function applyContribution(
    bucket: MutableBucket,
    numericValue: number | null,
    aggregation: ChartAggregation,
): void {
    if (aggregation === 'count') {
        bucket.value += 1;
        bucket.count += 1;
        return;
    }
    if (numericValue === null) return;
    bucket.count += 1;
    if (aggregation === 'sum' || aggregation === 'avg') {
        bucket.value += numericValue;
        return;
    }
    if (!bucket.initialized) {
        bucket.value = numericValue;
        bucket.initialized = true;
        return;
    }
    bucket.value = aggregation === 'min'
        ? Math.min(bucket.value, numericValue)
        : Math.max(bucket.value, numericValue);
}

function toBucket(bucket: MutableBucket): ChartBucket {
    return {
        id: bucket.id,
        label: bucket.label,
        color: bucket.color,
        value: bucket.value,
        rows: bucket.rows,
        count: bucket.count,
    };
}