<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import type { ChartConfiguration, ChartType, TooltipItem } from 'chart.js';
import type { ChartBucket, ChartKind } from './chartData';
import { formatChartValue } from './chartData';

const props = defineProps<{
    kind: ChartKind;
    buckets: ChartBucket[];
    metricLabel: string;
    total: number;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

onMounted(() => {
    void renderChart();
});

onBeforeUnmount(() => {
    chart?.destroy();
    chart = null;
});

watch(
    () => [props.kind, props.metricLabel, props.total, props.buckets] as const,
    () => { void renderChart(); },
    { deep: true, flush: 'post' },
);

async function renderChart(): Promise<void> {
    await nextTick();
    const node = canvas.value;
    if (!node) return;
    chart?.destroy();
    chart = new Chart(node, buildConfig(node));
}

function buildConfig(node: HTMLCanvasElement): ChartConfiguration {
    const kind = props.kind;
    const radial = isRadial(kind);
    const labels = chartBuckets(radial).map((bucket) => bucket.label);
    const values = chartBuckets(radial).map((bucket) => bucket.value);
    const colors = chartBuckets(radial).map((bucket) => bucket.color);
    const type = chartTypeFor(kind);

    return {
        type,
        data: {
            labels,
            datasets: [{
                label: props.metricLabel,
                data: values,
                backgroundColor: backgroundColors(node, kind, colors),
                borderColor: borderColors(colors),
                borderWidth: radial ? 1 : 1.5,
                borderRadius: kind === 'bar' || kind === 'horizontalBar' ? 6 : 0,
                fill: kind === 'area',
                tension: kind === 'line' || kind === 'area' ? 0.32 : 0,
                pointRadius: kind === 'line' || kind === 'area' ? 3 : 0,
                pointHoverRadius: kind === 'line' || kind === 'area' ? 5 : 0,
            }],
        },
        options: chartOptions(type, kind),
    };
}

function chartTypeFor(kind: ChartKind): ChartType {
    switch (kind) {
        case 'pie': return 'pie';
        case 'donut': return 'doughnut';
        case 'polarArea': return 'polarArea';
        case 'line':
        case 'area': return 'line';
        case 'bar':
        case 'horizontalBar': return 'bar';
    }
}

function chartBuckets(radial: boolean): ChartBucket[] {
    if (!radial || props.total > 0) return props.buckets;
    return [{ id: 'empty', label: 'No values', color: cssVar('--surface-3', '#2a2824'), value: 1, rows: 0, count: 0 }];
}

function chartOptions(type: ChartType, kind: ChartKind): ChartConfiguration['options'] {
    const radial = isRadial(kind);
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: kind === 'horizontalBar' ? 'y' : 'x',
        animation: { duration: 260, easing: 'easeOutQuart' },
        normalized: true,
        plugins: {
            legend: {
                display: radial,
                position: 'bottom',
                labels: {
                    boxWidth: 10,
                    boxHeight: 10,
                    color: cssVar('--text-secondary', '#a09b90'),
                    padding: 14,
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                },
            },
            tooltip: {
                displayColors: true,
                callbacks: {
                    label: (context: TooltipItem<ChartType>) => tooltipLabel(context),
                },
            },
        },
        scales: radial ? undefined : {
            x: axisOptions(type, kind, 'x'),
            y: axisOptions(type, kind, 'y'),
        },
    };
}

function axisOptions(type: ChartType, kind: ChartKind, axis: 'x' | 'y') {
    const valueAxis = kind === 'horizontalBar' ? axis === 'x' : axis === 'y';
    return {
        beginAtZero: valueAxis,
        border: {
            display: false,
        },
        grid: {
            color: valueAxis ? cssVar('--border', 'rgba(255,255,255,0.08)') : 'transparent',
        },
        ticks: {
            color: cssVar('--text-muted', '#8f887d'),
            maxRotation: type === 'line' ? 0 : 35,
            callback: valueAxis ? (value: string | number) => formatChartValue(Number(value)) : undefined,
        },
    };
}

function backgroundColors(node: HTMLCanvasElement, kind: ChartKind, colors: string[]): string[] | CanvasGradient {
    if (kind === 'area') return areaGradient(node, colors[0] ?? cssVar('--accent', '#6366f1'));
    if (kind === 'line') return colors.map((color) => withAlpha(color, '22'));
    if (kind === 'bar' || kind === 'horizontalBar') return colors.map((color) => withAlpha(color, 'bb'));
    return colors.map((color) => withAlpha(color, 'dd'));
}

function borderColors(colors: string[]): string[] {
    return colors.map((color) => withAlpha(color, 'ff'));
}

function areaGradient(node: HTMLCanvasElement, color: string): CanvasGradient {
    const ctx = node.getContext('2d');
    if (!ctx) {
        const fallback = document.createElement('canvas').getContext('2d');
        return fallback!.createLinearGradient(0, 0, 0, 240);
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, Math.max(240, node.clientHeight));
    gradient.addColorStop(0, withAlpha(color, '66'));
    gradient.addColorStop(1, withAlpha(color, '08'));
    return gradient;
}

function tooltipLabel(context: TooltipItem<ChartType>): string {
    const label = context.label ? `${context.label}: ` : '';
    return `${label}${formatChartValue(parsedValue(context.parsed))}`;
}

function parsedValue(parsed: unknown): number {
    if (typeof parsed === 'number') return parsed;
    if (parsed && typeof parsed === 'object') {
        const candidate = 'y' in parsed
            ? (parsed as { y?: unknown }).y
            : 'x' in parsed
                ? (parsed as { x?: unknown }).x
                : 'r' in parsed
                    ? (parsed as { r?: unknown }).r
                    : null;
        return typeof candidate === 'number' ? candidate : 0;
    }
    return 0;
}

function isRadial(kind: ChartKind): boolean {
    return kind === 'pie' || kind === 'donut' || kind === 'polarArea';
}

function cssVar(name: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function withAlpha(color: string, alpha: string): string {
    return /^#[0-9a-f]{6}$/i.test(color) ? `${color}${alpha}` : color;
}
</script>

<template>
    <div class="db-chart-canvas">
        <canvas ref="canvas" />
    </div>
</template>

<style scoped>
.db-chart-canvas {
    position: relative;
    flex: 1 1 auto;
    width: 100%;
    min-height: 300px;
    height: 100%;
}

.db-chart-canvas canvas {
    width: 100%;
    height: 100%;
}
</style>