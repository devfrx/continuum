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
    stageContextMenu: [evt: { clientX: number; clientY: number }];
    ready: [];
}>();

defineExpose({ zoom, zoomToFit, homeView });

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
    fx?: number; fy?: number; fz?: number;
    __initialPos?: CoordinateSnapshot;
    __initialFixedPos?: FixedPositionSnapshot;
}

type AxisKey = 'x' | 'y' | 'z';
type CoordinateSnapshot = Partial<Record<AxisKey, number>>;
type PositionSnapshot = Record<AxisKey, number>;
interface FixedPositionSnapshot {
    fx: number | undefined;
    fy: number | undefined;
    fz: number | undefined;
}

interface CascadeDragNodeSnapshot {
    position: PositionSnapshot;
    fixed: FixedPositionSnapshot;
    depth: number;
}

interface CascadeDragSession {
    draggedId: string;
    origin: THREE.Vector3;
    nodes: Map<string, CascadeDragNodeSnapshot>;
}

interface RtLink {
    source: string | RtNode;
    target: string | RtNode;
    type: string;
}

interface ManyBodyForce3D {
    strength(value: number): ManyBodyForce3D;
    distanceMin(value: number): ManyBodyForce3D;
    distanceMax(value: number): ManyBodyForce3D;
    theta(value: number): ManyBodyForce3D;
}

interface LinkForce3D {
    distance(value: number): LinkForce3D;
    strength(value: number): LinkForce3D;
    iterations(value: number): LinkForce3D;
}

interface CenterForce3D {
    strength(value: number): CenterForce3D;
}

const container = ref<HTMLDivElement | null>(null);
const graph = shallowRef<ForceGraph3DInstance | null>(null);
const nodesById = new Map<string, RtNode>();
const hoveredId = ref<string | null>(null);
let lastClick: { id: string; t: number } | null = null;
let fitTimer: number | null = null;
let cascadeDrag: CascadeDragSession | null = null;

/**
 * Watches the host element and forwards every size change to the
 * `3d-force-graph` instance (which internally drives Three.js renderer
 * + camera aspect ratio). Without this, an Electron window resize or a
 * sidebar toggle leaves the WebGL canvas frozen at the old dimensions
 * and the scene appears letterboxed / cropped.
 */
let resizeObserver: ResizeObserver | null = null;
let referenceFrame: THREE.Group | null = null;
let dragGuide: DragGuide | null = null;

const REFERENCE_FRAME_SIZE = 280;
const REFERENCE_FRAME_DIVISIONS = 14;
const REFERENCE_PLANE_Y = 0;
const REFERENCE_AXIS_LENGTH = 92;
const INITIAL_LAYOUT_COOLDOWN_MS = 2800;
const INITIAL_LAYOUT_TICKS = 220;
const INITIAL_LAYOUT_WARMUP_TICKS = 80;
const RUNTIME_RENDER_TICKS = 1;
const RUNTIME_RENDER_MS = 260;
const CHARGE_STRENGTH = -34;
const CHARGE_DISTANCE_MIN = 7;
const CHARGE_DISTANCE_MAX = 96;
const LINK_DISTANCE = 26;
const CASCADE_DEPTH_FALLOFF = 0.62;
const CASCADE_MIN_INFLUENCE = 0.12;
const DRAG_GUIDE_AXIS_LENGTH = 48;
const DRAG_GUIDE_ACTIVE_THRESHOLD = 2.5;

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

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const item of materials) {
        const texture = (item as THREE.SpriteMaterial).map;
        texture?.dispose?.();
        item.dispose();
    }
}

function disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
        const renderable = child as THREE.Object3D & {
            geometry?: { dispose?: () => void };
            material?: THREE.Material | THREE.Material[];
        };
        renderable.geometry?.dispose?.();
        disposeMaterial(renderable.material);
    });
}

function makeReferenceLabel(text: string, color: THREE.Color): THREE.Sprite | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = cssWithAlpha(p().labelBg, 0.88);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = color.getStyle();
    ctx.stroke();
    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p().labelFg;
    ctx.fillText(text, size / 2, size / 2 + 0.5);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
    }));
    sprite.scale.set(10, 10, 1);
    sprite.renderOrder = 20;
    return sprite;
}

function makeReferenceFrame(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'continuum-reference-frame';
    const grid = new THREE.GridHelper(
        REFERENCE_FRAME_SIZE,
        REFERENCE_FRAME_DIVISIONS,
        cssToThreeColor(p().edgeFocus),
        cssToThreeColor(p().grid || p().edgeDim),
    );
    grid.position.y = REFERENCE_PLANE_Y;
    grid.renderOrder = -10;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
        material.transparent = true;
        material.opacity = 0.34;
        material.depthWrite = false;
    }
    group.add(grid);

    const origin = new THREE.Vector3(0, REFERENCE_PLANE_Y + 0.6, 0);
    const axis = (name: string, dir: THREE.Vector3, color: THREE.Color, length = REFERENCE_AXIS_LENGTH): void => {
        group.add(new THREE.ArrowHelper(dir, origin, length, color, 7, 4));
        const label = makeReferenceLabel(name, color);
        if (!label) return;
        label.position.copy(origin).add(dir.clone().multiplyScalar(length + 10));
        group.add(label);
    };
    axis('X', new THREE.Vector3(1, 0, 0), cssToThreeColor(p().accent));
    axis('Y', new THREE.Vector3(0, 1, 0), cssToThreeColor(p().labelFg), REFERENCE_AXIS_LENGTH * 0.8);
    axis('Z', new THREE.Vector3(0, 0, 1), cssToThreeColor(p().edgeFocus));
    return group;
}

function refreshReferenceFrame(): void {
    const g = graph.value;
    if (!g) return;
    const scene = g.scene();
    if (referenceFrame) {
        scene.remove(referenceFrame);
        disposeObject(referenceFrame);
    }
    referenceFrame = makeReferenceFrame();
    scene.add(referenceFrame);
}

function configureInitialLayoutForces(instance: ForceGraph3DInstance): void {
    const charge = instance.d3Force('charge') as unknown as ManyBodyForce3D | undefined;
    charge
        ?.strength(CHARGE_STRENGTH)
        .distanceMin(CHARGE_DISTANCE_MIN)
        .distanceMax(CHARGE_DISTANCE_MAX)
        .theta(0.9);

    const link = instance.d3Force('link') as unknown as LinkForce3D | undefined;
    link
        ?.distance(LINK_DISTANCE)
        .strength(0.72)
        .iterations(2);

    const center = instance.d3Force('center') as unknown as CenterForce3D | undefined;
    center?.strength(0.18);

    instance
        .numDimensions(3)
        .warmupTicks(INITIAL_LAYOUT_WARMUP_TICKS)
        .cooldownTicks(INITIAL_LAYOUT_TICKS)
        .cooldownTime(INITIAL_LAYOUT_COOLDOWN_MS)
        .d3VelocityDecay(0.62)
        .d3AlphaDecay(0.075)
        .d3AlphaMin(0)
        .onEngineStop(() => configureRuntimeIdleForces(instance));
}

function configureRuntimeIdleForces(instance: ForceGraph3DInstance): void {
    const charge = instance.d3Force('charge') as unknown as ManyBodyForce3D | undefined;
    charge?.strength(0);

    const link = instance.d3Force('link') as unknown as LinkForce3D | undefined;
    link?.strength(0).iterations(1);

    const center = instance.d3Force('center') as unknown as CenterForce3D | undefined;
    center?.strength(0);

    instance
        .warmupTicks(0)
        .cooldownTicks(RUNTIME_RENDER_TICKS)
        .cooldownTime(RUNTIME_RENDER_MS)
        .d3VelocityDecay(1)
        .d3AlphaDecay(1)
        .d3AlphaMin(0);
}

type GuideLine = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

interface GuideLineBundle {
    line: GuideLine;
    positions: Float32Array;
}

interface DragGuide extends THREE.Group {
    userData: {
        origin: THREE.Vector3;
        vector: GuideLineBundle;
        xSegment: GuideLineBundle;
        ySegment: GuideLineBundle;
        zSegment: GuideLineBundle;
        dropLine: GuideLineBundle;
        xAxis: GuideLineBundle;
        yAxis: GuideLineBundle;
        zAxis: GuideLineBundle;
        labels: Partial<Record<AxisKey, THREE.Sprite>>;
        footprint: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    };
}

function numberOrZero(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function vectorOf(node: RtNode): THREE.Vector3 {
    return new THREE.Vector3(numberOrZero(node.x), numberOrZero(node.y), numberOrZero(node.z));
}

function dragOriginFor(node: RtNode): THREE.Vector3 {
    const initial = node.__initialPos;
    return new THREE.Vector3(
        numberOrZero(initial?.x ?? node.x),
        numberOrZero(initial?.y ?? node.y),
        numberOrZero(initial?.z ?? node.z),
    );
}

function axisColors(): Record<AxisKey, THREE.Color> {
    return {
        x: cssToThreeColor(p().accent),
        y: cssToThreeColor(p().labelFg),
        z: cssToThreeColor(p().edgeFocus),
    };
}

function makeGuideLine(color: THREE.Color, opacity: number): GuideLineBundle {
    const positions = new Float32Array(6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.renderOrder = 40;
    return { line, positions };
}

function setGuideLine(bundle: GuideLineBundle, from: THREE.Vector3, to: THREE.Vector3): void {
    bundle.positions[0] = from.x;
    bundle.positions[1] = from.y;
    bundle.positions[2] = from.z;
    bundle.positions[3] = to.x;
    bundle.positions[4] = to.y;
    bundle.positions[5] = to.z;
    const attribute = bundle.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    bundle.line.geometry.computeBoundingSphere();
}

function setGuideOpacity(bundle: GuideLineBundle, opacity: number): void {
    bundle.line.material.opacity = opacity;
    bundle.line.material.needsUpdate = true;
}

function activeAxisFor(delta: THREE.Vector3): AxisKey | null {
    const values: Record<AxisKey, number> = {
        x: Math.abs(delta.x),
        y: Math.abs(delta.y),
        z: Math.abs(delta.z),
    };
    const axis = (Object.keys(values) as AxisKey[]).reduce((best, key) => (
        values[key] > values[best] ? key : best
    ), 'x');
    return values[axis] >= DRAG_GUIDE_ACTIVE_THRESHOLD ? axis : null;
}

function componentOpacity(length: number, active: boolean): number {
    if (length < 1) return 0.08;
    return active ? 0.95 : 0.38 + Math.min(0.28, length / 180);
}

function makeDragGuide(origin: THREE.Vector3): DragGuide {
    const colors = axisColors();
    const group = new THREE.Group() as DragGuide;
    group.renderOrder = 40;

    const vector = makeGuideLine(highlightColor(), 0.9);
    const xSegment = makeGuideLine(colors.x, 0.35);
    const ySegment = makeGuideLine(colors.y, 0.35);
    const zSegment = makeGuideLine(colors.z, 0.35);
    const dropLine = makeGuideLine(colors.y, 0);
    const xAxis = makeGuideLine(colors.x, 0.28);
    const yAxis = makeGuideLine(colors.y, 0.28);
    const zAxis = makeGuideLine(colors.z, 0.28);

    group.add(dropLine.line, vector.line, xSegment.line, ySegment.line, zSegment.line, xAxis.line, yAxis.line, zAxis.line);

    const originDot = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 18, 12),
        new THREE.MeshBasicMaterial({ color: highlightColor(), transparent: true, opacity: 0.9, depthTest: false }),
    );
    originDot.position.copy(origin);
    originDot.renderOrder = 42;
    group.add(originDot);

    const footprint = new THREE.Mesh(
        new THREE.RingGeometry(4.5, 6.8, 36),
        new THREE.MeshBasicMaterial({
            color: highlightColor(),
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
    );
    footprint.rotation.x = Math.PI / 2;
    footprint.renderOrder = 39;
    group.add(footprint);

    const labels: Partial<Record<AxisKey, THREE.Sprite>> = {};
    for (const axis of Object.keys(colors) as AxisKey[]) {
        const label = makeReferenceLabel(axis.toUpperCase(), colors[axis]);
        if (!label) continue;
        label.renderOrder = 43;
        const material = label.material as THREE.SpriteMaterial;
        material.depthTest = false;
        material.depthWrite = false;
        material.transparent = true;
        material.opacity = 0.68;
        labels[axis] = label;
        group.add(label);
    }

    group.userData = { origin: origin.clone(), vector, xSegment, ySegment, zSegment, dropLine, xAxis, yAxis, zAxis, labels, footprint };
    updateDragGuide(group, origin);
    return group;
}

function updateDragGuide(guide: DragGuide, current: THREE.Vector3): void {
    const { origin, vector, xSegment, ySegment, zSegment, dropLine, xAxis, yAxis, zAxis, labels, footprint } = guide.userData;
    const colors = axisColors();
    const delta = new THREE.Vector3().subVectors(current, origin);
    const active = activeAxisFor(delta);
    const xPoint = new THREE.Vector3(current.x, origin.y, origin.z);
    const xyPoint = new THREE.Vector3(current.x, current.y, origin.z);
    const projected = new THREE.Vector3(current.x, REFERENCE_PLANE_Y, current.z);

    setGuideLine(vector, origin, current);
    setGuideLine(xSegment, origin, xPoint);
    setGuideLine(ySegment, xPoint, xyPoint);
    setGuideLine(zSegment, xyPoint, current);
    setGuideLine(dropLine, current, projected);
    setGuideLine(xAxis, current, current.clone().add(new THREE.Vector3(DRAG_GUIDE_AXIS_LENGTH, 0, 0)));
    setGuideLine(yAxis, current, current.clone().add(new THREE.Vector3(0, DRAG_GUIDE_AXIS_LENGTH, 0)));
    setGuideLine(zAxis, current, current.clone().add(new THREE.Vector3(0, 0, DRAG_GUIDE_AXIS_LENGTH)));

    setGuideOpacity(vector, delta.length() > 1 ? 0.86 : 0.14);
    setGuideOpacity(xSegment, componentOpacity(Math.abs(delta.x), active === 'x'));
    setGuideOpacity(ySegment, componentOpacity(Math.abs(delta.y), active === 'y'));
    setGuideOpacity(zSegment, componentOpacity(Math.abs(delta.z), active === 'z'));
    setGuideOpacity(xAxis, active === 'x' ? 0.9 : 0.28);
    setGuideOpacity(yAxis, active === 'y' ? 0.9 : 0.28);
    setGuideOpacity(zAxis, active === 'z' ? 0.9 : 0.28);

    const dropDistance = Math.abs(current.y - REFERENCE_PLANE_Y);
    const dropAbove = current.y >= REFERENCE_PLANE_Y;
    const dropColor = dropAbove ? colors.z : colors.x;
    dropLine.line.material.color.copy(dropColor);
    setGuideOpacity(dropLine, dropDistance > 2 ? Math.min(0.72, 0.24 + dropDistance / 120) : 0);
    footprint.position.copy(projected);
    footprint.material.color.copy(dropColor);
    footprint.material.opacity = dropDistance > 2 ? Math.min(0.42, 0.16 + dropDistance / 180) : 0;
    footprint.visible = dropDistance > 2;

    labels.x?.position.copy(current).add(new THREE.Vector3(DRAG_GUIDE_AXIS_LENGTH + 7, 0, 0));
    labels.y?.position.copy(current).add(new THREE.Vector3(0, DRAG_GUIDE_AXIS_LENGTH + 7, 0));
    labels.z?.position.copy(current).add(new THREE.Vector3(0, 0, DRAG_GUIDE_AXIS_LENGTH + 7));
    for (const axis of Object.keys(labels) as AxisKey[]) {
        const material = labels[axis]?.material as THREE.SpriteMaterial | undefined;
        if (material) material.opacity = active === axis ? 1 : 0.58;
    }
}

function showDragGuide(node: RtNode): void {
    const scene = graph.value?.scene();
    if (!scene) return;
    clearDragGuide();
    dragGuide = makeDragGuide(dragOriginFor(node));
    scene.add(dragGuide);
}

function clearDragGuide(): void {
    if (!dragGuide) return;
    graph.value?.scene().remove(dragGuide);
    disposeObject(dragGuide);
    dragGuide = null;
}

function fixedPositionSnapshot(node: RtNode): FixedPositionSnapshot {
    return { fx: node.fx, fy: node.fy, fz: node.fz };
}

function dragFixedPositionSnapshot(node: RtNode): FixedPositionSnapshot {
    return node.__initialFixedPos
        ? { ...node.__initialFixedPos }
        : fixedPositionSnapshot(node);
}

function restoreFixedPosition(node: RtNode, snapshot: FixedPositionSnapshot): void {
    if (snapshot.fx === undefined) delete node.fx;
    else node.fx = snapshot.fx;
    if (snapshot.fy === undefined) delete node.fy;
    else node.fy = snapshot.fy;
    if (snapshot.fz === undefined) delete node.fz;
    else node.fz = snapshot.fz;
}

function positionSnapshot(node: RtNode): PositionSnapshot {
    return {
        x: numberOrZero(node.x),
        y: numberOrZero(node.y),
        z: numberOrZero(node.z),
    };
}

function setNodePosition(node: RtNode, position: PositionSnapshot, fixed: boolean): void {
    node.x = position.x;
    node.y = position.y;
    node.z = position.z;
    if (!fixed) return;
    node.fx = position.x;
    node.fy = position.y;
    node.fz = position.z;
}

function requestPositionRender(): void {
    graph.value?.d3ReheatSimulation();
}

function restoreNavigationControlsSoon(): void {
    window.setTimeout(() => graph.value?.enableNavigationControls(true), 0);
}

function connectedDepthsFrom(root: RtNode): Map<string, number> {
    const depths = new Map<string, number>([[root.id, 0]]);
    const queue: RtNode[] = [root];
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        for (const neighborId of current.neighbors) {
            if (depths.has(neighborId)) continue;
            const neighbor = nodesById.get(neighborId);
            if (!neighbor) continue;
            depths.set(neighborId, (depths.get(current.id) ?? 0) + 1);
            queue.push(neighbor);
        }
    }
    return depths;
}

function dragOriginSnapshot(node: RtNode): PositionSnapshot {
    const initial = node.__initialPos;
    return {
        x: numberOrZero(initial?.x ?? node.x),
        y: numberOrZero(initial?.y ?? node.y),
        z: numberOrZero(initial?.z ?? node.z),
    };
}

function beginCascadeDrag(node: RtNode): void {
    releaseCascadeDrag();
    if (graph.value) {
        graph.value.enableNavigationControls(false);
        configureRuntimeIdleForces(graph.value);
    }
    const depths = connectedDepthsFrom(node);
    const snapshots = new Map<string, CascadeDragNodeSnapshot>();

    for (const [id, depth] of depths) {
        const current = nodesById.get(id);
        if (!current) continue;
        snapshots.set(id, {
            position: id === node.id ? dragOriginSnapshot(node) : positionSnapshot(current),
            fixed: id === node.id ? dragFixedPositionSnapshot(current) : fixedPositionSnapshot(current),
            depth,
        });
    }

    const origin = snapshots.get(node.id)?.position ?? positionSnapshot(node);
    cascadeDrag = {
        draggedId: node.id,
        origin: new THREE.Vector3(origin.x, origin.y, origin.z),
        nodes: snapshots,
    };
}

function cascadeInfluence(depth: number): number {
    if (depth <= 0) return 1;
    return Math.max(CASCADE_MIN_INFLUENCE, CASCADE_DEPTH_FALLOFF ** depth);
}

function applyCascadeDrag(node: RtNode): void {
    const session = cascadeDrag;
    if (!session) return;
    const current = vectorOf(node);
    const delta = current.sub(session.origin);

    for (const [id, snapshot] of session.nodes) {
        const currentNode = nodesById.get(id);
        if (!currentNode) continue;
        const influence = cascadeInfluence(snapshot.depth);
        setNodePosition(currentNode, {
            x: snapshot.position.x + delta.x * influence,
            y: snapshot.position.y + delta.y * influence,
            z: snapshot.position.z + delta.z * influence,
        }, true);
    }
}

function maintainCascadeDrag(node: RtNode): void {
    if (cascadeDrag?.draggedId !== node.id) beginCascadeDrag(node);
    applyCascadeDrag(node);
}

function releaseCascadeDrag(draggedNode?: RtNode): void {
    const session = cascadeDrag;
    if (!session) return;
    const node = draggedNode ?? nodesById.get(session.draggedId);
    if (node) applyCascadeDrag(node);
    cascadeDrag = null;

    for (const [id, snapshot] of session.nodes) {
        const current = nodesById.get(id);
        if (!current) continue;
        restoreFixedPosition(current, snapshot.fixed);
    }
    requestPositionRender();
}

function onSimpleNodeDrag(node: RtNode): void {
    maintainCascadeDrag(node);
    if (!dragGuide) showDragGuide(node);
    if (dragGuide) updateDragGuide(dragGuide, vectorOf(node));
    requestPositionRender();
}

function onSimpleNodeDragEnd(node: RtNode): void {
    releaseCascadeDrag(node);
    restoreNavigationControlsSoon();
    clearDragGuide();
}

interface ElevationGuide extends THREE.Group {
    userData: {
        line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
        footprint: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
        linePositions: Float32Array;
        aboveColor: THREE.Color;
        belowColor: THREE.Color;
        primary: boolean;
    };
}

function updateElevationGuide(guide: ElevationGuide, nodeWorldY: number): void {
    const delta = REFERENCE_PLANE_Y - nodeWorldY;
    const distance = Math.abs(delta);
    const visible = distance > 3;
    const above = nodeWorldY >= REFERENCE_PLANE_Y;
    const color = above ? guide.userData.aboveColor : guide.userData.belowColor;
    const strength = Math.min(1, distance / 120);

    const lineMaterial = guide.userData.line.material;
    lineMaterial.color.copy(color);
    lineMaterial.opacity = visible
        ? (guide.userData.primary ? 0.22 + strength * 0.26 : 0.08 + strength * 0.16)
        : 0;
    lineMaterial.needsUpdate = true;

    const positions = guide.userData.linePositions;
    positions[3] = 0;
    positions[4] = delta;
    positions[5] = 0;
    guide.userData.line.geometry.attributes.position.needsUpdate = true;
    guide.userData.line.geometry.computeBoundingSphere();

    const footprintMaterial = guide.userData.footprint.material;
    footprintMaterial.color.copy(color);
    footprintMaterial.opacity = visible
        ? (guide.userData.primary ? 0.3 + strength * 0.18 : 0.1 + strength * 0.1)
        : 0;
    footprintMaterial.needsUpdate = true;

    guide.userData.footprint.position.set(0, delta, 0);
    guide.userData.footprint.visible = visible;
    guide.userData.line.visible = visible;
}

function makeElevationGuide(radius: number, primary: boolean): ElevationGuide {
    const group = new THREE.Group() as ElevationGuide;
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
        color: highlightColor(),
        transparent: true,
        opacity: primary ? 0.34 : 0.14,
        depthWrite: false,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.renderOrder = -2;
    group.add(line);

    const footprint = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(2.8, radius * 0.5), Math.max(3.8, radius * 0.74), 32),
        new THREE.MeshBasicMaterial({
            color: highlightColor(),
            transparent: true,
            opacity: primary ? 0.38 : 0.16,
            depthWrite: false,
            side: THREE.DoubleSide,
        }),
    );
    footprint.rotation.x = Math.PI / 2;
    footprint.renderOrder = -1;
    group.add(footprint);

    group.userData = {
        line,
        footprint,
        linePositions: positions,
        aboveColor: cssToThreeColor(p().edgeFocus),
        belowColor: cssToThreeColor(p().accent),
        primary,
    };
    const sync = () => {
        const parent = group.parent;
        if (!parent) return;
        updateElevationGuide(group, parent.position.y);
    };
    line.onBeforeRender = sync;
    footprint.onBeforeRender = sync;
    return group;
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

function finitePositionOf(node: Pick<RtNode, 'x' | 'y' | 'z'>): PositionSnapshot | null {
    if (
        typeof node.x !== 'number' || !Number.isFinite(node.x)
        || typeof node.y !== 'number' || !Number.isFinite(node.y)
        || typeof node.z !== 'number' || !Number.isFinite(node.z)
    ) return null;
    return { x: node.x, y: node.y, z: node.z };
}

function previousNodePositions(): Map<string, PositionSnapshot> {
    const positions = new Map<string, PositionSnapshot>();
    for (const node of nodesById.values()) {
        const position = finitePositionOf(node);
        if (position) positions.set(node.id, position);
    }
    return positions;
}

// ---------- Build runtime data from payload ----------

function buildRuntimeData(): { nodes: RtNode[]; links: RtLink[] } {
    const previousPositions = previousNodePositions();
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
        const previous = previousPositions.get(n.id);
        if (previous) setNodePosition(rt, previous, false);
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

    group.add(makeElevationGuide(r, isPrimary || isFocus || isSelectedMarker || isHighlighted));

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

function homeView() {
    const g = graph.value;
    if (!g) return;
    if (cascadeDrag) return;
    const count = Math.max(1, nodesById.size);
    const distance = Math.max(210, Math.min(620, Math.sqrt(count) * 52));
    const target = { x: 0, y: 0, z: 0 };
    g.cameraPosition(
        { x: distance * 0.82, y: distance * 0.48, z: distance * 0.9 },
        target,
        650,
    );
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
    releaseCascadeDrag();
    clearDragGuide();
    const data = buildRuntimeData();
    configureInitialLayoutForces(g);
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
    const instance = new ForceGraph3D(container.value, { controlType: 'orbit' })
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
        .onBackgroundRightClick((evt) => {
            evt.preventDefault?.();
            emit('stageContextMenu', { clientX: evt.clientX, clientY: evt.clientY });
        })
        .onNodeDrag((n) => onSimpleNodeDrag(n as RtNode))
        .onNodeDragEnd((n) => onSimpleNodeDragEnd(n as RtNode))
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

    configureInitialLayoutForces(instance);

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
    refreshReferenceFrame();
    applyDataAndStyles();

    // Push initial dimensions and start observing the container so
    // window/Electron resizes propagate into the WebGL renderer.
    const syncSize = (): void => {
        const el = container.value;
        const g = graph.value;
        if (!el || !g) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (w > 0 && h > 0) g.width(w).height(h);
    };
    syncSize();
    resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(container.value);

    emit('ready');
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    releaseCascadeDrag();
    clearDragGuide();
    if (referenceFrame && graph.value) {
        graph.value.scene().remove(referenceFrame);
        disposeObject(referenceFrame);
        referenceFrame = null;
    }
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
    refreshReferenceFrame();
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
