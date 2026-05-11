<script setup lang="ts">
/**
 * ChartCanvas — pure rendering layer for the Chart block.
 *
 * Owns the lifecycle of a single Chart.js instance: creates it on
 * mount, replaces its config when attributes change, destroys it on
 * unmount. Keeping rendering isolated here means the surrounding
 * NodeView can re-layout (toolbar, editor panel) without juggling
 * canvas teardown.
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import {
    Chart as ChartJS,
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    PieController,
    DoughnutController,
    RadarController,
    ArcElement,
    RadialLinearScale,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler,
    Title,
    type ChartConfiguration,
    type ChartType,
} from 'chart.js';
import type { ChartData, ChartKind, ChartOptions } from './chartTypes';

ChartJS.register(
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    PieController,
    DoughnutController,
    RadarController,
    ArcElement,
    RadialLinearScale,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler,
    Title,
);

const props = defineProps<{
    kind: ChartKind;
    data: ChartData;
    options: ChartOptions;
}>();

import { CHART_PALETTE as PALETTE } from './chartPalette';

const canvasEl = ref<HTMLCanvasElement | null>(null);
let instance: ChartJS | null = null;

function colorFor(idx: number, explicit?: string): string {
    if (explicit && explicit.trim()) return explicit;
    return PALETTE[idx % PALETTE.length];
}

function chartType(kind: ChartKind): ChartType {
    // Area is rendered as a filled line chart in Chart.js.
    if (kind === 'area') return 'line';
    return kind;
}

function withAlpha(hex: string, alpha: number): string {
    // Best-effort hex → rgba; falls back to the original string for non-hex.
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildConfig(): ChartConfiguration {
    const isArea = props.kind === 'area';
    const isPieLike = props.kind === 'pie' || props.kind === 'doughnut';
    const isRadar = props.kind === 'radar';

    const datasets = props.data.datasets.map((ds, i) => {
        const base = colorFor(i, ds.color);
        if (isPieLike) {
            const colors = ds.data.map((_, idx) => colorFor(idx));
            return {
                label: ds.label,
                data: ds.data,
                backgroundColor: colors,
                borderColor: 'transparent',
            };
        }
        return {
            label: ds.label,
            data: ds.data,
            borderColor: base,
            backgroundColor: isArea || isRadar ? withAlpha(base, 0.25) : base,
            fill: isArea ? 'origin' : isRadar,
            tension: props.kind === 'line' || isArea ? 0.3 : 0,
            pointRadius: props.kind === 'line' || isArea || isRadar ? 3 : 0,
        };
    });

    const showGrid = props.options.showGrid !== false;
    const showLegend = props.options.showLegend !== false;

    return {
        type: chartType(props.kind),
        data: { labels: props.data.labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: showLegend, position: 'bottom' },
                tooltip: { enabled: true },
            },
            scales: isPieLike
                ? {}
                : isRadar
                    ? {
                        r: {
                            grid: { display: showGrid },
                            angleLines: { display: showGrid },
                        },
                    }
                    : {
                        x: { grid: { display: showGrid } },
                        y: { grid: { display: showGrid }, beginAtZero: true },
                    },
        },
    };
}

function render(): void {
    if (!canvasEl.value) return;
    if (instance) {
        instance.destroy();
        instance = null;
    }
    instance = new ChartJS(canvasEl.value, buildConfig());
}

onMounted(render);
onBeforeUnmount(() => {
    if (instance) {
        instance.destroy();
        instance = null;
    }
});

watch(
    () => [props.kind, props.data, props.options],
    () => render(),
    { deep: true },
);
</script>

<template>
    <canvas ref="canvasEl" class="continuum-chart__canvas" />
</template>

<style scoped>
.continuum-chart__canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
}
</style>
