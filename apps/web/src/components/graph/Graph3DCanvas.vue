<script setup lang="ts">
/**
 * 3D knowledge-graph renderer (the "neural-network" view).
 *
 * Wraps `3d-force-graph` (Three.js + d3-force-3d) and reuses every
 * cross-cutting concern of the 2D Sigma view:
 *   - Shared graph palette (background, node colours, link tint,
 *     particle accent).
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
 *   - Label sprites painted on a 2D canvas as compact name cards, with
 *     a soft shadow, accent rail and token-driven border/fill so they
 *     read as UI rather than floating stickers.
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
    focusMode: boolean;
}
const props = withDefaults(defineProps<Props>(), {
    focusMode: false,
});

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
let fitTimer: number | null = null;

// ---------- Theme-reactive palette ----------
// Read from CSS custom properties so the 3D canvas (background, label
// pills, link tints, dim colour) flips together with the rest of the
// app when the user toggles dark mode.
const palette = useGraphPalette();
function p(): GraphPalette { return palette.value; }

/** Convert a CSS colour token (`#RRGGBB`, `rgb(...)` or `rgba(...)`) to a THREE.Color. */
function cssToThreeColor(input: string, fallback = 0xe8dcc8): THREE.Color {
    const c = new THREE.Color();
    try {
        // THREE understands `#rgb`, `#rrggbb`, `rgb()` and named colours.
        // For `rgba()` we strip the alpha component first.
        const cleaned = input.startsWith('rgba')
            ? input.replace(/rgba\(([^)]+)\)/, (_m, body: string) => {
                const parts = body.split(',').slice(0, 3).join(',');
                return `rgb(${parts})`;
            })
            : input;
        c.set(cleaned);
        return c;
    } catch {
        return c.setHex(fallback);
    }
}

/** Cream accent halo / ring / particle colour (theme-reactive). */
function highlightColor(): THREE.Color {
    return cssToThreeColor(p().accent || '#e8dcc8');
}

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

/** Effective focus id: hover previews focus; focus mode locks selection focus. */
function focusedId(): string | null {
    return hoveredId.value ?? (props.focusMode ? props.selectedId : null);
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

// ---------- Compact label card sprite (canvas → CanvasTexture → Sprite) ----------

function cssWithAlpha(input: string, alpha: number): string {
    const hex = input.trim();
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
        const r = Number.parseInt(hex.slice(1, 3), 16);
        const g = Number.parseInt(hex.slice(3, 5), 16);
        const b = Number.parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (hex.startsWith('rgba(')) return hex.replace(/,\s*[\d.]+\)$/u, `, ${alpha})`);
    if (hex.startsWith('rgb(')) return hex.replace(/^rgb\((.*)\)$/u, `rgba($1, ${alpha})`);
    return input;
}

function compactLabel(text: string): string {
    const clean = text.trim() || '(untitled)';
    return clean.length > 42 ? `${clean.slice(0, 39)}...` : clean;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function makeLabelSprite(
    text: string,
    opts: { bold?: boolean; dim?: boolean; accent?: string } = {},
): THREE.Sprite | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const label = compactLabel(text);
    const fontSize = opts.bold ? 18 : 16;
    const padX = 14;
    const padY = 7;
    const radius = 6;
    const railWidth = opts.bold ? 4 : 3;
    const margin = 6;

    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return null;
    measure.font = `${opts.bold ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`;
    const textW = measure.measureText(label).width;

    const w = Math.ceil(textW + padX * 2 + railWidth + 6);
    const h = Math.ceil(fontSize + padY * 2);
    const cssW = w + margin * 2;
    const cssH = h + margin * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    const x = margin;
    const y = margin;
    const accent = opts.accent ?? p().edgeFocus;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = cssWithAlpha(p().labelBg, opts.bold ? 0.88 : 0.76);
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    roundedRect(ctx, x, y, w, h, radius);
    ctx.lineWidth = opts.bold ? 1.25 : 1;
    ctx.strokeStyle = opts.bold ? p().edgeFocus : p().labelBorder;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + radius, y + 1);
    ctx.lineTo(x + w - radius, y + 1);
    ctx.strokeStyle = cssWithAlpha(p().labelFg, 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();

    roundedRect(ctx, x + 7, y + 6, railWidth, h - 12, railWidth / 2);
    ctx.fillStyle = cssWithAlpha(accent, opts.dim ? 0.45 : 0.95);
    ctx.fill();

    if (opts.bold) {
        ctx.fillStyle = cssWithAlpha(accent, 0.08);
        roundedRect(ctx, x + railWidth + 12, y + 4, w - railWidth - 16, h - 8, radius - 3);
        ctx.fill();
    }

    ctx.font = `${opts.bold ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = p().labelFg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + railWidth + padX + 5, y + h / 2 + 0.5);

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
        depthTest: false,
        // Sprites are unlit; keep the card from being washed by scene lights.
        toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    // Each CSS px ~= 0.12 graph units. The shadow margin is included.
    sprite.scale.set(cssW * 0.12, cssH * 0.12, 1);
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
    const isSelectedMarker = props.selectedId === node.id && !props.focusMode && !isFocus;
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
            emissiveIntensity: isFocus ? 0.35 : isSelectedMarker ? 0.24 : isFocusNeighbor ? 0.18 : isHighlighted ? 0.25 : 0.06,
        }),
    );
    if (isFocus) sphere.scale.setScalar(1.2);
    else if (isSelectedMarker) sphere.scale.setScalar(1.1);
    group.add(sphere);

    // Soft additive halo: strong for real focus, quieter for plain selection.
    if (isFocus || isSelectedMarker) {
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(r * (isFocus ? 1.55 : 1.42), 24, 18),
            new THREE.MeshBasicMaterial({
                color: highlightColor(),
                transparent: true,
                opacity: isFocus ? 0.16 : 0.1,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        group.add(halo);
    }

    // Persistent user-highlight ring (cream accent torus).
    if (isHighlighted || isSelectedMarker) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(r * 1.4, 0.4, 12, 48),
            new THREE.MeshBasicMaterial({ color: highlightColor() }),
        );
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
    }

    const sprite = makeLabelSprite(node.label || '(untitled)', {
        bold: isFocus || isSelectedMarker,
        dim: !isPrimary && !isFocus && !isSelectedMarker,
        accent: isFocus || isSelectedMarker || isHighlighted ? p().edgeFocus : props.colorOf(node.kind),
    });
    if (sprite) {
        sprite.position.set(0, r + 3.1, 0);
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
    scheduleFitToView();
}

function scheduleFitToView() {
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

    // Keep disconnected components near the same readable constellation.
    instance.d3Force('charge')?.strength(-42);
    instance.d3Force('link')?.distance(24);
    instance.d3VelocityDecay(0.48).d3AlphaDecay(0.035).cooldownTime(6000);

    // Three-light rig tuned for a calm, professional feel:
    //   - low ambient so the spheres don't go flat,
    //   - hemisphere fill that lifts the tops without colour cast,
    //   - one cool key + one warm rim so each sphere reads as a 3D
    //     pebble rather than a sticker on the canvas.
    const scene = instance.scene();
    const bgColor = new THREE.Color(p().bg);
    scene.fog = new THREE.Fog(bgColor, 220, 1100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0xf6efe1, 0x101010, 0.55);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(120, 180, 220);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8dcc8, 0.35);
    rim.position.set(-150, -60, -180);
    scene.add(rim);

    graph.value = instance;
    applyDataAndStyles();
    emit('ready');
});

onBeforeUnmount(() => {
    if (graph.value) {
        (graph.value as unknown as { _destructor?: () => void })._destructor?.();
        graph.value = null;
    }
    if (fitTimer !== null) window.clearTimeout(fitTimer);
    fitTimer = null;
    nodesById.clear();
});

// ---------- Reactive bridges ----------

watch(() => props.payload, () => {
    hoveredId.value = null;
    applyDataAndStyles();
}, { deep: false });

watch(
    () => [props.hiddenKinds.size, props.searchQuery, props.selectedId,
    props.highlightedIds.size, props.focusMode],
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
