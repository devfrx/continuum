<script setup lang="ts">
/**
 * 3D knowledge-graph renderer (the "neural-network" view).
 *
 * Wraps `3d-force-graph` (Three.js + d3-force-3d) and reuses every
 * cross-cutting concern of the 2D Sigma view:
 *   - Cream/terracotta Anthropic-like palette (background, node colors,
 *     link tint, particle accent).
 *   - The same `selected` / `searchQuery` / `hiddenKinds` / `userHighlight`
 *     semantics: emits `select` / `openNote` / `contextMenu` so the
 *     parent can keep its panels and right-click menu unchanged.
 *
 * Visual layering:
 *   - MeshPhongMaterial spheres with subtle emissive (the "neuron"),
 *     lit by an ambient + key + warm-rim light rig.
 *   - Additive halo sphere on focused / highlighted nodes for the soft
 *     glow effect — cheaper and more controllable than UnrealBloom on
 *     a warm cream palette (a full-scene bloom pass washed everything
 *     into white-out because every node was already bright on cream).
 *   - Label sprites painted on a 2D canvas with a rounded warm pill
 *     identical in look to the 2D hover card (cream fill + terracotta
 *     border), so labels feel like the same product.
 *   - Hover isolates the 1-hop subgraph: the hovered node grows, its
 *     neighbours stay vivid, everything else fades to taupe.
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import * as THREE from 'three';
import type { GraphEdge, GraphNode } from '@continuum/shared';
import { useGraphPalette, type GraphPalette } from '@/composables/useGraphPalette';

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
}
const props = defineProps<Props>();

const emit = defineEmits<{
    select: [info: SelectedInfo | null];
    openNote: [id: string];
    contextMenu: [evt: { id: string; clientX: number; clientY: number; highlighted: boolean }];
    ready: [];
}>();

defineExpose({ zoom, zoomToFit, reheat });

// ---------- Internal state ----------

interface RtNode extends GraphNode {
    /** Pre-computed neighbour set so reducers stay O(1) per frame. */
    neighbors: Set<string>;
    inDegree: number;
    outDegree: number;
    wikilinkCount: number;
    relatedCount: number;
    // Force-graph mutates these at runtime:
    x?: number; y?: number; z?: number;
}

interface RtLink {
    source: string | RtNode;
    target: string | RtNode;
    type: string;
}

const container = ref<HTMLDivElement | null>(null);
const graph = shallowRef<ForceGraph3DInstance | null>(null);
const nodesById = new Map<string, RtNode>();
const hoveredId = ref<string | null>(null);
let lastClick: { id: string; t: number } | null = null;

// ---------- Theme-reactive palette ----------
// Read from CSS custom properties so the 3D canvas (background, label
// pills, link tints, dim colour) flips together with the rest of the
// app when the user toggles dark mode.
const palette = useGraphPalette();
function p(): GraphPalette { return palette.value; }

const HIGHLIGHT_RING = 0xc96e4a; // terracotta accent for halos / rings

const NODE_BASE_R = 4;
const NODE_DEGREE_SCALE = 1.4;

function radiusFor(node: RtNode): number {
    return Math.sqrt(Math.max(0, node.inDegree + node.outDegree)) * NODE_DEGREE_SCALE + NODE_BASE_R;
}

function linkColorFor(linkType: string): string {
    return linkType === 'wikilink' ? p().edgeFocus : p().edge;
}

function linkIdOf(end: string | RtNode): string {
    return typeof end === 'string' ? end : end.id;
}

// ---------- Build runtime data from payload ----------

function buildRuntimeData(): { nodes: RtNode[]; links: RtLink[] } {
    nodesById.clear();
    if (!props.payload) return { nodes: [], links: [] };

    const nodes: RtNode[] = props.payload.nodes.map((n) => {
        const rt: RtNode = {
            ...n,
            neighbors: new Set<string>(),
            inDegree: 0,
            outDegree: 0,
            wikilinkCount: 0,
            relatedCount: 0,
        };
        nodesById.set(n.id, rt);
        return rt;
    });

    const links: RtLink[] = [];
    for (const e of props.payload.edges) {
        const s = nodesById.get(e.source);
        const t = nodesById.get(e.target);
        if (!s || !t) continue;
        links.push({ source: e.source, target: e.target, type: e.type });
        s.neighbors.add(t.id);
        t.neighbors.add(s.id);
        s.outDegree++;
        t.inDegree++;
        if (e.type === 'wikilink') { s.wikilinkCount++; t.wikilinkCount++; }
        else { s.relatedCount++; t.relatedCount++; }
    }
    return { nodes, links };
}

// ---------- Visibility / colour reducers ----------

/** Effective focus id: hover wins over selection (matches 2D behaviour). */
function focusedId(): string | null {
    return hoveredId.value ?? props.selectedId;
}

function nodeVisible(node: RtNode): boolean {
    return !props.hiddenKinds.has(node.kind);
}

function linkVisible(link: RtLink): boolean {
    const s = nodesById.get(linkIdOf(link.source));
    const t = nodesById.get(linkIdOf(link.target));
    if (!s || !t) return false;
    return nodeVisible(s) && nodeVisible(t);
}

function isFocused(id: string): boolean {
    return focusedId() === id;
}

function isNeighborOfFocus(id: string): boolean {
    const f = focusedId();
    if (!f) return false;
    const focus = nodesById.get(f);
    return !!focus && focus.neighbors.has(id);
}

function isSearchMatch(node: RtNode): boolean {
    const q = props.searchQuery.trim().toLowerCase();
    if (!q) return false;
    return node.label.toLowerCase().includes(q);
}

function nodeColorFor(node: RtNode): string {
    const hasQuery = props.searchQuery.trim().length > 0;
    if (hasQuery && !isSearchMatch(node)) return p().nodeDim;
    if (focusedId() && !(isFocused(node.id) || isNeighborOfFocus(node.id))
        && !props.highlightedIds.has(node.id)) {
        return p().nodeDim;
    }
    return props.colorOf(node.kind);
}

/**
 * Whether the node should render at full intensity (saturated colour,
 * normal halo + label). Anything else is "dimmed" — used to drive both
 * sphere material and label opacity.
 */
function isNodePrimary(node: RtNode): boolean {
    const hasQuery = props.searchQuery.trim().length > 0;
    if (hasQuery && !isSearchMatch(node)) return false;
    const f = focusedId();
    if (f && !(isFocused(node.id) || isNeighborOfFocus(node.id))
        && !props.highlightedIds.has(node.id)) return false;
    return true;
}

function linkColorReducer(link: RtLink): string {
    const sId = linkIdOf(link.source);
    const tId = linkIdOf(link.target);
    const f = focusedId();
    if (f) {
        if (sId === f || tId === f) return p().edgeFocus;
        return p().edgeDim;
    }
    return linkColorFor(link.type);
}

function linkWidthReducer(link: RtLink): number {
    const sId = linkIdOf(link.source);
    const tId = linkIdOf(link.target);
    const f = focusedId();
    if (f && (sId === f || tId === f)) return 1.6;
    return 0.6;
}

function particlesFor(link: RtLink): number {
    const f = focusedId();
    if (!f) return 2;
    const sId = linkIdOf(link.source);
    const tId = linkIdOf(link.target);
    return sId === f || tId === f ? 4 : 0;
}

// ---------- Label pill sprite (canvas → CanvasTexture → Sprite) ----------

function makeLabelSprite(text: string, opts: { bold?: boolean; dim?: boolean } = {}): THREE.Sprite | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fontSize = 28;
    const padX = 18;
    const padY = 10;
    const radius = 14;

    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return null;
    measure.font = `${opts.bold ? 600 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
    const textW = measure.measureText(text).width;

    const w = Math.ceil(textW + padX * 2);
    const h = Math.ceil(fontSize + padY * 2);

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    // Rounded rect.
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();

    // Card-style pill — theme-aware fill + border, matches the 2D label.
    ctx.fillStyle = p().labelBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = opts.bold ? p().edgeFocus : p().labelBorder;
    ctx.stroke();

    ctx.font = `${opts.bold ? 600 : 500} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = p().labelFg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: opts.dim ? 0.35 : 1,
        depthWrite: false,
        depthTest: true,
        // Sprites are unlit — keep the chip from being washed by the bloom pass.
        toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    // Each CSS px ≈ 0.18 graph units.
    sprite.scale.set(w * 0.18, h * 0.18, 1);
    return sprite;
}

// ---------- Three.js node object: sphere + label sprite (+ optional ring) ----------

function makeNodeObject(node: RtNode): THREE.Object3D {
    const group = new THREE.Group();
    const r = radiusFor(node);
    // Sphere colour respects search + focus dimming so the node
    // visually fades alongside its links when off-target.
    const color = new THREE.Color(nodeColorFor(node));
    const isHighlighted = props.highlightedIds.has(node.id);
    const focus = focusedId();
    const isFocus = focus === node.id;
    const isFocusNeighbor = isNeighborOfFocus(node.id);
    const isPrimary = isNodePrimary(node);

    // Matte Lambert shading — no specular highlight (the previous Phong
    // setup produced a bright "reflection" hot-spot that read as a
    // post-processing bloom). Emissive stays low-key so colours look
    // saturated under both the warm and dark themes.
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(r, 32, 24),
        new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: isFocus ? 0.35 : isFocusNeighbor ? 0.18 : isHighlighted ? 0.25 : 0.06,
        }),
    );
    if (isFocus) sphere.scale.setScalar(1.2);
    group.add(sphere);

    // Soft additive halo: discreet on focus, off otherwise.
    if (isFocus) {
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(r * 1.45, 24, 18),
            new THREE.MeshBasicMaterial({
                color: HIGHLIGHT_RING,
                transparent: true,
                opacity: 0.10,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        group.add(halo);
    }

    // Persistent user-highlight ring (terracotta torus).
    if (isHighlighted) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(r * 1.35, 0.45, 10, 40),
            new THREE.MeshBasicMaterial({ color: HIGHLIGHT_RING }),
        );
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
    }

    // Label pill — bold + bordered when focused/hovered, dimmed when off-target.
    const sprite = makeLabelSprite(node.label || '(untitled)', { bold: isFocus, dim: !isPrimary && !isFocus });
    if (sprite) {
        sprite.position.set(0, r + 3.2, 0);
        sprite.renderOrder = 10;
        group.add(sprite);
    }

    return group;
}

// ---------- Camera helpers exposed to parent ----------

function zoom(direction: 1 | -1) {
    const g = graph.value;
    if (!g) return;
    const cam = g.camera() as THREE.PerspectiveCamera;
    const factor = direction === 1 ? 0.78 : 1.28; // closer / farther
    const target = (g.controls() as { target?: THREE.Vector3 } | undefined)?.target
        ?? new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3().subVectors(cam.position, target);
    dir.multiplyScalar(factor);
    const next = new THREE.Vector3().addVectors(target, dir);
    g.cameraPosition({ x: next.x, y: next.y, z: next.z }, target, 350);
}

function zoomToFit() {
    graph.value?.zoomToFit(600, 80);
}

function reheat() {
    graph.value?.d3ReheatSimulation();
}

// ---------- Pointer event helpers ----------

function selectionFor(node: RtNode): SelectedInfo {
    return {
        id: node.id,
        label: node.label,
        kind: node.kind,
        inDegree: node.inDegree,
        outDegree: node.outDegree,
        wikilinkCount: node.wikilinkCount,
        relatedCount: node.relatedCount,
    };
}

// ---------- Lifecycle ----------

function applyDataAndStyles() {
    const g = graph.value;
    if (!g) return;
    const data = buildRuntimeData();
    g.graphData({ nodes: data.nodes, links: data.links });
}

/**
 * Re-invoke the node factory (and refresh links) without mutating
 * positions. Cheap enough to call on every hover / selection /
 * highlight change.
 */
function refreshVisuals() {
    const g = graph.value;
    if (!g) return;
    g.nodeColor((n) => nodeColorFor(n as RtNode))
        .nodeThreeObject((n) => makeNodeObject(n as RtNode))
        .linkColor((l) => linkColorReducer(l as RtLink))
        .linkWidth((l) => linkWidthReducer(l as RtLink))
        .linkDirectionalParticles((l) => particlesFor(l as RtLink))
        .linkDirectionalArrowColor((l) => linkColorReducer(l as RtLink));
}

onMounted(() => {
    if (!container.value) return;
    const instance = new ForceGraph3D(container.value)
        .backgroundColor(p().bg)
        .showNavInfo(false)
        .nodeThreeObject((n) => makeNodeObject(n as RtNode))
        .nodeThreeObjectExtend(false)
        .nodeVisibility((n) => nodeVisible(n as RtNode))
        .nodeColor((n) => nodeColorFor(n as RtNode))
        .nodeLabel(() => '') // we draw our own label sprites
        .linkVisibility((l) => linkVisible(l as RtLink))
        .linkColor((l) => linkColorReducer(l as RtLink))
        .linkOpacity(0.6)
        .linkWidth((l) => linkWidthReducer(l as RtLink))
        .linkDirectionalParticles((l) => particlesFor(l as RtLink))
        .linkDirectionalParticleWidth(0.9)
        .linkDirectionalParticleSpeed(0.006)
        .linkDirectionalParticleColor(() => p().edgeFocus)
        .linkDirectionalArrowLength(2.4)
        .linkDirectionalArrowRelPos(0.94)
        .linkDirectionalArrowColor((l) => linkColorReducer(l as RtLink))
        .onBackgroundClick(() => emit('select', null))
        .onNodeHover((n) => {
            const id = (n as RtNode | null)?.id ?? null;
            if (id === hoveredId.value) return;
            hoveredId.value = id;
            if (container.value) container.value.style.cursor = id ? 'pointer' : '';
            refreshVisuals();
        })
        .onNodeClick((n) => {
            const node = n as RtNode;
            const now = performance.now();
            if (lastClick && lastClick.id === node.id && now - lastClick.t < 350) {
                emit('openNote', node.id);
                lastClick = null;
                return;
            }
            lastClick = { id: node.id, t: now };
            emit('select', selectionFor(node));
        })
        .onNodeRightClick((n, evt) => {
            const node = n as RtNode;
            const me = evt as MouseEvent;
            me.preventDefault?.();
            emit('contextMenu', {
                id: node.id,
                clientX: me.clientX,
                clientY: me.clientY,
                highlighted: props.highlightedIds.has(node.id),
            });
        });

    // Soften physics so the cluster breathes rather than explodes.
    instance.d3Force('charge')?.strength(-110);
    instance.d3Force('link')?.distance(28);

    // Neutral, even lighting — a single ambient + soft hemisphere fill.
    // No specular hotspots so the matte spheres read as flat coloured
    // pebbles rather than glossy chrome.
    const scene = instance.scene();
    scene.fog = new THREE.Fog(new THREE.Color(p().bg), 240, 950);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.45);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);

    graph.value = instance;
    applyDataAndStyles();
    emit('ready');
});

onBeforeUnmount(() => {
    if (graph.value) {
        (graph.value as unknown as { _destructor?: () => void })._destructor?.();
        graph.value = null;
    }
    nodesById.clear();
});

// ---------- Reactive bridges ----------

watch(() => props.payload, () => {
    hoveredId.value = null;
    applyDataAndStyles();
}, { deep: false });

watch(
    () => [props.hiddenKinds.size, props.searchQuery, props.selectedId,
    props.highlightedIds.size],
    () => refreshVisuals(),
);

/**
 * Theme palette — when the user toggles dark mode, the bg, fog and
 * label sprites must all repaint so nothing carries over the previous
 * scheme. We rebuild label sprites via `refreshVisuals()` and replace
 * the scene-level bg/fog directly.
 */
watch(palette, (next) => {
    const g = graph.value;
    if (!g) return;
    g.backgroundColor(next.bg);
    const scene = g.scene();
    if (scene.fog && 'color' in scene.fog) {
        (scene.fog as THREE.Fog).color = new THREE.Color(next.bg);
    }
    refreshVisuals();
}, { deep: false });
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
