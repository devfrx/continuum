<script setup lang="ts">
/**
 * 3D knowledge-graph renderer (the "neural-network" view).
 *
 * Wraps `3d-force-graph` (Three.js + d3-force-3d) and reuses every
 * cross-cutting concern of the 2D Sigma view (palette, hidden kinds,
 * search query, user highlight, selection / context menu emits).
 *
 * This file is the orchestrator: every domain concern (scene
 * bootstrap, force config, drag cascade, axis lock, label sprites,
 * elevation guides, infinite grid, drag guide, node factory, camera
 * presets) lives in a focused composable under
 * `@/composables/graph3d/*`.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import type { GraphEdge, GraphNode } from '@continuum/shared';
import { useGraphPalette } from '@/composables/useGraphPalette';
import { graphDisplayLabel } from '@/utils/graphLabels';
import type { LodTier } from '@/components/graph/lodConfig';
import {
    type AxisKey,
    type RtNode,
} from '@/composables/graph3d/types';
import { rebuildRuntimeGraph } from '@/composables/graph3d/runtimeGraph';
import { useThreeScene } from '@/composables/graph3d/useThreeScene';
import { useForceConfig } from '@/composables/graph3d/useForceConfig';
import { useInfiniteGrid } from '@/composables/graph3d/useInfiniteGrid';
import { useLabelSpritePainter } from '@/composables/graph3d/useLabelSpritePainter';
import { useElevationGuide } from '@/composables/graph3d/useElevationGuide';
import { useDragGuide } from '@/composables/graph3d/useDragGuide';
import { useAxisLockKeyboard } from '@/composables/graph3d/useAxisLockKeyboard';
import { useDragCascade } from '@/composables/graph3d/useDragCascade';
import { useNodeFactory, type NodeFactoryProps } from '@/composables/graph3d/useNodeFactory';
import { useCameraPresets } from '@/composables/graph3d/useCameraPresets';
import {
    refreshForceGraphReducers,
    wireForceGraphCallbacks,
} from '@/composables/graph3d/forceGraphBindings';

export interface SelectedInfo {
    id: string;
    label: string;
    kind: string;
    inDegree: number;
    outDegree: number;
    wikilinkCount: number;
    relatedCount: number;
}

interface Props {
    payload: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
    colorOf: (kind: string) => string;
    hiddenKinds: Set<string>;
    highlightedIds: Set<string>;
    searchQuery: string;
    selectedId: string | null;
    /** Optional LOD tier override; defaults to `near` (full detail). */
    lodTier?: LodTier;
}
const props = withDefaults(defineProps<Props>(), {
    lodTier: 'near',
});

const emit = defineEmits<{
    select: [info: SelectedInfo | null];
    openNote: [id: string];
    contextMenu: [evt: { id: string; clientX: number; clientY: number; highlighted: boolean }];
    ready: [];
}>();

// ---------- Shared per-instance state ----------

const container = ref<HTMLDivElement | null>(null);
const hoveredId = ref<string | null>(null);
const nodesById = new Map<string, RtNode>();
const palette = useGraphPalette();
let lastClick: { id: string; t: number } | null = null;
let fitTimer: number | null = null;

const factoryPropsView = (): NodeFactoryProps => ({
    hiddenKinds: props.hiddenKinds,
    highlightedIds: props.highlightedIds,
    searchQuery: props.searchQuery,
    selectedId: props.selectedId,
    colorOf: props.colorOf,
    lodTier: props.lodTier,
});

// ---------- Composables ----------

const forceConfig = useForceConfig();
const labelPainter = useLabelSpritePainter(palette);
const elevationGuide = useElevationGuide(palette);
const referenceFrame = useInfiniteGrid({
    palette,
    nodes: () => nodesById.values(),
    nodeCount: () => nodesById.size,
});

const axisLock = useAxisLockKeyboard({
    onChange: () => dragCascade.refreshActive(),
    shouldCapture: () => dragCascade.draggedId() !== null,
});

const dragGuide = useDragGuide({
    palette,
    activeAxisLock: () => axisLock.activeAxis(),
    painter: labelPainter,
});

// `dragCascade` and `useThreeScene` reference each other; declare a
// forward placeholder so the keyboard composable above can call into
// the cascade once it's constructed below.
let dragCascade!: ReturnType<typeof useDragCascade>;

const { graph } = useThreeScene({
    container,
    palette,
    configure: (instance) => {
        wireForceGraphCallbacks(instance, {
            factory,
            particleColor: () => palette.value.edgeFocus,
            onBackgroundClick: () => emit('select', null),
            onNodeDrag: (n) => dragCascade.onDrag(n),
            onNodeDragEnd: (n) => dragCascade.onDragEnd(n),
            onNodeHover: (n) => {
                const id = n?.id ?? null;
                if (id === hoveredId.value) return;
                hoveredId.value = id;
                if (container.value) container.value.style.cursor = id ? 'pointer' : '';
                refreshVisuals();
            },
            onNodeClick: (n) => {
                const now = performance.now();
                if (lastClick && lastClick.id === n.id && now - lastClick.t < 350) {
                    emit('openNote', n.id);
                    lastClick = null;
                    return;
                }
                lastClick = { id: n.id, t: now };
                emit('select', selectionFor(n));
            },
            onNodeRightClick: (n, me) => emit('contextMenu', {
                id: n.id,
                clientX: me.clientX,
                clientY: me.clientY,
                highlighted: props.highlightedIds.has(n.id),
            }),
        });
        forceConfig.configureInitialLayout(instance);
        referenceFrame.refresh(instance.scene());
        applyDataAndStyles();
    },
    onPaletteChange: () => {
        const g = graph.value;
        if (!g) return;
        referenceFrame.refresh(g.scene());
        refreshVisuals();
    },
    onReady: () => emit('ready'),
});

dragCascade = useDragCascade({
    graph,
    nodesById,
    axisLock: () => axisLock.activeAxis(),
    configureRuntimeIdle: forceConfig.configureRuntimeIdle,
    dragGuide,
});

const factory = useNodeFactory({
    palette,
    hoveredId,
    nodesById,
    draggedId: () => dragCascade.draggedId(),
    elevationGuide,
    labelPainter,
    props: factoryPropsView,
});

const camera = useCameraPresets({
    graph,
    nodesById,
    isDragging: () => dragCascade.draggedId() !== null,
});

defineExpose({
    zoom: camera.zoom,
    zoomToFit: camera.zoomToFit,
    homeView: camera.homeView,
    focusNode: camera.focusNode,
    viewAlongAxis: (axis: AxisKey) => camera.viewAlongAxis(axis),
});

// ---------- Runtime data + visuals ----------

function selectionFor(node: RtNode): SelectedInfo {
    return {
        id: node.id,
        label: graphDisplayLabel(node.label, 48),
        kind: node.kind,
        inDegree: node.inDegree,
        outDegree: node.outDegree,
        wikilinkCount: node.wikilinkCount,
        relatedCount: node.relatedCount,
    };
}

function applyDataAndStyles(): void {
    const g = graph.value;
    if (!g) return;
    dragCascade.release();
    dragGuide.clear();
    const data = rebuildRuntimeGraph(nodesById, props.payload);
    forceConfig.configureInitialLayout(g);
    g.graphData({ nodes: data.nodes, links: data.links });
    referenceFrame.refresh(g.scene());
    scheduleFitToView();
}

function scheduleFitToView(): void {
    if (fitTimer !== null) window.clearTimeout(fitTimer);
    fitTimer = window.setTimeout(() => {
        fitTimer = null;
        graph.value?.zoomToFit(700, 120);
    }, 850);
}

/**
 * Re-invoke the node factory (and refresh links) without mutating
 * positions. Cheap enough to call on every hover / selection /
 * highlight change.
 */
function refreshVisuals(): void {
    const g = graph.value;
    if (!g) return;
    refreshForceGraphReducers(g, factory);
}

// ---------- Reactive bridges ----------

watch(() => props.payload, () => {
    hoveredId.value = null;
    applyDataAndStyles();
}, { deep: false });

watch(
    () => [
        props.hiddenKinds.size,
        props.searchQuery,
        props.selectedId,
        props.highlightedIds.size,
        props.lodTier,
    ],
    () => refreshVisuals(),
);

onBeforeUnmount(() => {
    dragCascade.release();
    dragGuide.clear();
    referenceFrame.dispose();
    if (fitTimer !== null) window.clearTimeout(fitTimer);
    fitTimer = null;
    nodesById.clear();
});
</script>

<template>
    <div ref="container" class="graph3d-canvas" />
</template>

<style scoped>
.graph3d-canvas {
    position: absolute;
    inset: 0;
    background-color: var(--bg);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.graph3d-canvas :deep(canvas) {
    display: block;
    outline: none;
}

.graph3d-canvas :deep(.scene-tooltip) {
    display: none;
}
</style>
