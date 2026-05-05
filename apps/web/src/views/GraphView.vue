<script setup lang="ts">
/**
 * Knowledge Graph view.
 *
 * Architecture:
 *   - `@continuum/graph` exports `buildGraph`, `Sigma`, layout helpers, and
 *     visual constants. All Sigma program wiring (curved arrows, bordered
 *     nodes) lives in the package.
 *   - The view layers absolutely-positioned UI panels over a full-canvas
 *     Sigma renderer. No CSS is bled into global styles.
 *
 * Navigation contract: opening a note pushes
 *   { path: '/', query: { note: <id> } }
 * NotesView (owned by another agent) auto-selects the matching note.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  buildGraph,
  buildSigmaProgramSettings,
  highlightNeighbors,
  runCircularLayout,
  Sigma,
  startLiveSimulation,
  type Graph,
  type LiveSimulationHandle,
} from '@continuum/graph';
import { api } from '@/api';
import {
  Icon,
  UiButton,
  UiCard,
  UiChip,
  UiConfirmModal,
  UiEmpty,
  UiInput,
  UiNotePickerModal,
  UiPromptModal,
} from '@/components/ui';
import type { IconName } from '@/components/ui/icons';
import { getIconImage } from '@/components/graph/iconRasterizer';
import Graph3DCanvas from '@/components/graph/Graph3DCanvas.vue';
import type { SelectedInfo as Graph3DSelected } from '@/components/graph/Graph3DCanvas.vue';
import NoteCreateModal from '@/components/notes/NoteCreateModal.vue';
import { useKinds } from '@/composables/useKinds';
import { useGraphPalette } from '@/composables/useGraphPalette';
import type { EntityKind, GraphEdge, GraphNode, KindDefinition } from '@continuum/shared';

interface SelectedInfo {
  id: string;
  label: string;
  kind: string;
  inDegree: number;
  outDegree: number;
  wikilinkCount: number;
  relatedCount: number;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** Node id when right-clicking a node; `null` when right-clicking empty stage. */
  nodeId: string | null;
  highlighted: boolean;
  /**
   * Where the right-click landed on the Sigma stage in graph coordinates.
   * Captured for the empty-stage "Create note here" action so a future
   * iteration can persist the position. `null` for node menus.
   */
  stage: { x: number; y: number } | null;
}

type LayoutMode = 'force' | 'circular';
type ViewMode = '3d' | '2d';

const router = useRouter();
const kindStore = useKinds();
const palette = useGraphPalette();

const container = ref<HTMLDivElement | null>(null);
const sigmaInstance = shallowRef<Sigma | null>(null);
const graphRef = shallowRef<Graph | null>(null);

/**
 * View mode — 3D is the new core base view (neural-network style),
 * 2D remains a one-click fallback for the classic Sigma layout.
 * Toggling via `setViewMode()` only flips visibility; both renderers
 * stay mounted to preserve their WebGL contexts and camera state.
 */
const viewMode = ref<ViewMode>('3d');

/**
 * Raw payload cache. Both renderers consume the same data: Sigma turns
 * it into a Graphology graph, the 3D canvas builds Three.js objects.
 * Re-fetched only on `load()`.
 */
const payload = shallowRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);

/**
 * Mirror of the per-node `userHighlight` attribute that lives on the
 * Graphology graph. Kept as a reactive Set so the 3D canvas can
 * subscribe without poking into Sigma internals.
 */
const highlightedIds = shallowRef<Set<string>>(new Set<string>());

/**
 * Imperative handle to the 3D canvas — lets the toolbar drive its
 * camera (zoom in/out, fit to view) and reuse a single set of UI
 * controls across both render modes.
 */
const graph3dRef = ref<{
  zoom: (direction: 1 | -1) => void;
  zoomToFit: () => void;
  homeView: () => void;
} | null>(null);

const stats = ref({ nodes: 0, edges: 0 });
const loading = ref(false);
const selected = ref<SelectedInfo | null>(null);
const hoveredNode = ref<string | null>(null);
const hoveredEdge = ref<string | null>(null);
const layoutMode = ref<LayoutMode>('force');
const legendOpen = ref(false);
const focusMode = ref(false);
const helpOpen = ref(false);
const searchQuery = ref('');
const hiddenKinds = reactive<Set<string>>(new Set());
const matchedNodes = shallowRef<Set<string>>(new Set());
const contextMenu = reactive<ContextMenuState>({
  visible: false, x: 0, y: 0, nodeId: null, highlighted: false, stage: null,
});

// Modal state for Rename / Delete (replaces native window.prompt/confirm).
const renameModal = reactive({
  open: false,
  /** Note id being edited — captured before the ctx menu closes. */
  nodeId: '' as string,
  initial: '' as string,
});
const deleteModal = reactive({
  open: false,
  nodeId: '' as string,
  label: '' as string,
});

/**
 * Link-from-graph modal state. Captures the source node before the
 * context menu closes and snapshots the rest of the graph as picker
 * entries (cheap — graphRef holds everything we need).
 */
const linkModal = reactive({
  open: false,
  sourceId: '' as string,
  sourceLabel: '' as string,
  /** Note ids already linked to source, so we can pre-disable them. */
  alreadyLinked: new Set<string>(),
  entries: [] as Array<{ id: string; label: string; kind?: string; disabled?: boolean }>,
});
const linkBusy = ref(false);
const graphCreateOpen = ref(false);
const graphCreateBusy = ref(false);
const graphCreateError = ref('');
const graphCreateStage = ref<{ x: number; y: number } | null>(null);

const isEmpty = computed(() => !loading.value && stats.value.nodes === 0);
const viewLabel = computed(() => {
  if (viewMode.value === '3d') return '3D spatial';
  return layoutMode.value === 'force' ? '2D live' : '2D ring';
});

const activeFilters = computed<KindDefinition[]>(() =>
  kindStore.kinds.value.filter((k) => hiddenKinds.has(k.id)),
);

function iconNameOf(kind: string): IconName {
  return kindStore.iconOf(kind) as IconName;
}

let draggedNode: string | null = null;
let isDragging = false;
let liveSim: LiveSimulationHandle | null = null;

// ---------- Sigma reducers ----------

function recomputeMatches(): void {
  const g = graphRef.value;
  const q = searchQuery.value.trim().toLowerCase();
  if (!g || !q) {
    matchedNodes.value = new Set();
    return;
  }
  const matches = new Set<string>();
  g.forEachNode((id, attrs) => {
    const label = String((attrs as { label?: string }).label ?? '').toLowerCase();
    if (label.includes(q)) matches.add(id);
  });
  matchedNodes.value = matches;
}

function activeFocusId(): string | null {
  return focusMode.value ? selected.value?.id ?? hoveredNode.value : hoveredNode.value;
}

function applyReducers(sigma: Sigma, graph: Graph) {
  sigma.setSetting('nodeReducer', (node, data) => {
    const res: Record<string, unknown> = { ...data };
    const kind = String((data as { kind?: string }).kind ?? 'custom');
    const baseSize = Number((data as { baseSize?: number }).baseSize ?? data.size ?? 14);
    const pal = palette.value;

    // 1. Hidden kind → near-invisible micro dot, no label, no icon.
    if (hiddenKinds.has(kind)) {
      res.color = pal.nodeHidden;
      res.size = baseSize * 0.35;
      res.label = '';
      res.zIndex = 0;
      (res as { dimmed?: boolean }).dimmed = true;
      return res;
    }

    // 2. Search filter — dim non-matches into background dots.
    const matches = matchedNodes.value;
    const hasQuery = matches.size > 0 || searchQuery.value.trim().length > 0;
    if (hasQuery && !matches.has(node)) {
      res.color = pal.nodeDim;
      res.size = baseSize * 0.55;
      res.label = '';
      (res as { dimmed?: boolean }).dimmed = true;
    } else if (hasQuery && matches.has(node)) {
      res.zIndex = 2;
    }

    // 3. Selection / hover focus — vivid focus subgraph, dim background.
    const focusId = activeFocusId();
    const isUserHighlighted = Boolean((data as { userHighlight?: boolean }).userHighlight);
    if (focusId) {
      const { nodes } = highlightNeighbors(graph, focusId);
      const inSet = nodes.has(node);
      if (!inSet) {
        // Background nodes fade to small dark dots — the focus subgraph
        // becomes the only thing the eye reaches for. User-highlighted
        // nodes stay vivid so they're never lost.
        if (!isUserHighlighted) {
          res.color = pal.nodeDim;
          res.size = baseSize * 0.55;
          res.label = '';
          (res as { dimmed?: boolean }).dimmed = true;
        }
      } else if (node === focusId) {
        // Focused node — gentle size bump + top zIndex. We deliberately
        // do NOT set `highlighted = true`: that would move the node to
        // Sigma's hovers canvas, where the labels-canvas icon overlay
        // would no longer paint. The custom hover renderer redraws the
        // icon + label card on the hovers layer instead.
        res.size = baseSize * 1.22;
        res.zIndex = 3;
      } else {
        // Neighbours: subtle bump only.
        res.size = baseSize * 1.06;
        res.zIndex = 2;
      }
    }

    if (!focusMode.value && selected.value?.id === node) {
      res.size = Math.max(Number(res.size ?? baseSize), baseSize * 1.14);
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 2);
      (res as { borderColor?: string }).borderColor = pal.edgeFocus;
    }

    // 4. Persistent user highlight — toggled from the context menu.
    //    Renders an accent border + bumped size that survives focus mode
    //    and search dimming. The border colour is read by the bordered
    //    Sigma program via the `borderColor` attribute (configured to be
    //    attribute-driven in `buildSigmaProgramSettings`).
    if (isUserHighlighted) {
      res.size = Math.max(Number(res.size ?? baseSize), baseSize * 1.45);
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 3);
      (res as { borderColor?: string }).borderColor = pal.accent;
    }

    return res;
  });

  sigma.setSetting('edgeReducer', (edge, data) => {
    const res: Record<string, unknown> = { ...data };
    const pal = palette.value;
    const baseSize = Number((data as { baseSize?: number }).baseSize ?? data.size ?? 1);
    res.color = pal.edge;
    res.size = baseSize;

    // Hide edges connecting hidden-kind endpoints
    const [src, tgt] = graph.extremities(edge);
    const srcKind = String(graph.getNodeAttribute(src, 'kind') ?? 'custom');
    const tgtKind = String(graph.getNodeAttribute(tgt, 'kind') ?? 'custom');
    if (hiddenKinds.has(srcKind) || hiddenKinds.has(tgtKind)) {
      res.color = 'rgba(0,0,0,0)';
      res.size = 0;
      return res;
    }

    const focusId = activeFocusId();
    if (focusId) {
      const { edges } = highlightNeighbors(graph, focusId);
      if (edges.has(edge)) {
        res.color = pal.edgeFocus;
        res.size = baseSize * 1.6;
        res.zIndex = 2;
      } else {
        res.color = pal.edgeDim;
      }
    }

    if (hoveredEdge.value && hoveredEdge.value === edge) {
      res.color = pal.edgeFocus;
      res.size = baseSize * 1.8;
    }

    return res;
  });
}

// ---------- Selection helper ----------

function buildSelected(graph: Graph, id: string): SelectedInfo {
  const attrs = graph.getNodeAttributes(id) as { label?: string; kind?: string };
  let wikilinkCount = 0;
  let relatedCount = 0;
  graph.forEachEdge(id, (_e, edgeAttrs) => {
    const linkType = (edgeAttrs as { linkType?: string }).linkType;
    if (linkType === 'wikilink') wikilinkCount++;
    else relatedCount++;
  });
  return {
    id,
    label: attrs.label ?? '(untitled)',
    kind: attrs.kind ?? 'custom',
    inDegree: graph.inDegree(id),
    outDegree: graph.outDegree(id),
    wikilinkCount,
    relatedCount,
  };
}

// ---------- Load + Sigma lifecycle ----------

async function load() {
  if (!container.value) return;
  loading.value = true;
  try {
    await kindStore.load();
    const data = await api.links.graph();
    payload.value = { nodes: data.nodes, edges: data.edges };
    highlightedIds.value = new Set<string>();
    const g = buildGraph({
      ...data,
      colorResolver: (k) => kindStore.colorOf(k),
      // Skip the offline force pass — the live simulation will animate the
      // graph from the seeded positions, which is what makes the motion
      // visible from the very first frame.
      runLayout: false,
    });
    graphRef.value = g;
    stats.value = { nodes: g.order, edges: g.size };

    sigmaInstance.value?.kill();
    liveSim?.stop();
    liveSim = null;
    selected.value = null;
    hoveredNode.value = null;
    hoveredEdge.value = null;
    matchedNodes.value = new Set();
    closeContextMenu();

    if (g.order === 0) {
      sigmaInstance.value = null;
      return;
    }

    const sigma = new Sigma(g, container.value, {
      ...buildSigmaProgramSettings(),
      // Sigma's WebGL `hoverNodes` layer falls back to the regular bordered
      // program when no hover-specific class is provided here, repainting the
      // hovered node above our 2D `hovers` canvas. The regular `nodes` layer
      // already shows the disc, so we defang this by hiding the `hoverNodes`
      // canvas via CSS (`canvas.sigma-hoverNodes { display: none }`). The
      // empty mapping below documents the intent.
      nodeHoverProgramClasses: {},
      // The 2D container is `v-show`-hidden while the user stays in 3D
      // mode — width is 0 at construction time. Without this flag Sigma
      // throws "Container has no width". We refresh the renderer when
      // the user actually switches to 2D, so the geometry is correct
      // by the time it becomes visible.
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      // Sigma's `labelColor.color` and `defaultEdgeColor` are read once per
      // call — we drive them through the palette (theme-reactive) and the
      // theme watcher reapplies via `applyPaletteToSigma` on dark-mode flip.
      labelColor: { color: palette.value.labelFg },
      labelSize: 12,
      labelWeight: '500',
      labelFont: 'Inter, system-ui, sans-serif',
      // Show labels eagerly — bigger nodes leave room and Obsidian-style
      // graphs are most useful when you can read every title.
      labelDensity: 1.2,
      labelGridCellSize: 60,
      labelRenderedSizeThreshold: 4,
      defaultEdgeColor: palette.value.edge,
      minEdgeThickness: 1.0,
      zIndex: true,
    });
    sigmaInstance.value = sigma;

    // Replace the default label callback with our icon-aware version so
    // glyphs are drawn in the same coordinate system as the labels —
    // this is the only way to keep them perfectly anchored to nodes.
    sigma.setSetting(
      'defaultDrawNodeLabel',
      makeLabelRenderer(sigma) as Parameters<typeof sigma.setSetting<'defaultDrawNodeLabel'>>[1],
    );
    // Override the hover callback too: Sigma's default draws a white circle
    // on the hovers canvas that would bury the icon drawn on labels canvas.
    sigma.setSetting(
      'defaultDrawNodeHover',
      makeHoverRenderer(sigma) as Parameters<typeof sigma.setSetting<'defaultDrawNodeHover'>>[1],
    );

    bindInteractions(sigma, g);
    applyReducers(sigma, g);

    // Continuous Obsidian-style spring physics. The simulation runs on its
    // own rAF loop and refreshes Sigma each tick; we never call layout
    // helpers from here for the force mode.
    liveSim = startLiveSimulation(g, {
      onTick: () => sigma.refresh({ skipIndexation: true }),
    });
  } finally {
    loading.value = false;
  }
}

/**
 * Draw the kind icon centred on every visible node.
 *
 * Why this lives inside `defaultDrawNodeLabel` rather than `afterRender`:
 *   - Sigma calls the label callback once per node with `data.x/y/size`
 *     **already transformed** into the labels-canvas coordinate system.
 *     The same x/y produces correctly-anchored text below the node,
 *     so reusing it for the icon guarantees pixel-perfect alignment
 *     under any pan, zoom, drag or HiDPI configuration.
 *   - Hooking `afterRender` and converting graph→viewport ourselves was
 *     producing icons that drifted away from nodes during interaction,
 *     because Sigma's labels canvas already has a context transform
 *     applied that we were unaware of.
 *
 * Hidden / dimmed / culled nodes have `data.label` cleared by the
 * reducer, so the early-return below skips them automatically — the
 * icon and label always appear/disappear together.
 */
type NodeRenderData = {
  label?: string;
  x: number;
  y: number;
  size: number;
  kind?: string;
  color?: string;
  highlighted?: boolean;
  dimmed?: boolean;
};
type RenderSettings = { labelSize: number; labelFont: string };
type NodeRenderFn = (ctx: CanvasRenderingContext2D, data: NodeRenderData, settings: RenderSettings) => void;

/**
 * Draw the kind icon centred on the node, then a card-style label pill
 * below it. Hover variant additionally paints a soft accent halo around
 * the node so the focus is unmistakeable without burying the glyph.
 */
function drawIconAndLabel(
  ctx: CanvasRenderingContext2D,
  data: NodeRenderData,
  settings: RenderSettings,
  img: HTMLImageElement | null,
  variant: 'label' | 'hover',
) {
  const pal = palette.value;
  const isHover = variant === 'hover';

  // Hover halo — soft accent ring that frames the node without covering
  // the icon. Drawn under the icon so the glyph stays crisp on top.
  if (isHover) {
    const r = data.size + 4;
    const grad = ctx.createRadialGradient(data.x, data.y, data.size * 0.6, data.x, data.y, r * 1.4);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, pal.accentSoft);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(data.x, data.y, r * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp 1px accent ring exactly on the node edge.
    ctx.beginPath();
    ctx.arc(data.x, data.y, data.size + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = pal.edgeFocus;
    ctx.stroke();
  }

  if (img && data.size >= 6) {
    const px = data.size * 1.15;
    const half = px / 2;
    ctx.drawImage(img, data.x - half, data.y - half, px, px);
  }
  if (!data.label) return;

  const weight = isHover ? '600' : '500';
  const fontPx = settings.labelSize;
  ctx.font = `${weight} ${fontPx}px ${settings.labelFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = 8;
  const padY = 4;
  const radius = 6;
  const textW = ctx.measureText(data.label).width;
  const w = Math.ceil(textW + padX * 2);
  const h = Math.ceil(fontPx + padY * 2);
  const x = data.x - w / 2;
  const y = data.y + data.size + 6;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = pal.labelBg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isHover ? pal.edgeFocus : pal.labelBorder;
  ctx.stroke();

  ctx.fillStyle = pal.labelFg;
  ctx.fillText(data.label, data.x, y + h / 2);
}

/**
 * Label renderer — called for every node that needs a visible label.
 * Dimmed nodes are background dots: no icon, no pill. Foreground nodes
 * get the icon glyph + title pill.
 */
function makeLabelRenderer(sigma: Sigma): NodeRenderFn {
  const refresh = () => sigma.refresh({ skipIndexation: true });
  return (ctx, data, settings) => {
    if (data.dimmed || !data.label) return;
    const kind = String(data.kind ?? 'custom');
    const img = getIconImage(kindStore.iconOf(kind), refresh);
    drawIconAndLabel(ctx, data, settings, img, 'label');
  };
}

/**
 * Hover renderer — called for the single hovered node on the `hovers`
 * canvas. Sigma's default draws an opaque white circle that buries the
 * icon; we replace it with a soft accent halo + the same icon/label
 * pair so the glyph survives the hover state.
 */
function makeHoverRenderer(sigma: Sigma): NodeRenderFn {
  const refresh = () => sigma.refresh({ skipIndexation: true });
  return (ctx, data, settings) => {
    const kind = String(data.kind ?? 'custom');
    const img = getIconImage(kindStore.iconOf(kind), refresh);
    drawIconAndLabel(ctx, data, settings, img, 'hover');
  };
}

function bindInteractions(sigma: Sigma, graph: Graph) {
  // --- Node drag (LEFT mouse button only — right is reserved for ctx menu) ---
  sigma.on('downNode', (e) => {
    const orig = e.event.original as MouseEvent | undefined;
    if (orig && orig.button !== 0) return; // ignore right / middle
    isDragging = true;
    draggedNode = e.node;
    liveSim?.setDragged(e.node);
    if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
    if (container.value) container.value.style.cursor = 'grabbing';
  });

  sigma.getMouseCaptor().on('mousemovebody', (e) => {
    if (!isDragging || !draggedNode) return;
    const pos = sigma.viewportToGraph(e);
    graph.setNodeAttribute(draggedNode, 'x', pos.x);
    graph.setNodeAttribute(draggedNode, 'y', pos.y);
    e.preventSigmaDefault();
    e.original.preventDefault();
    e.original.stopPropagation();
  });

  const handleUp = (rawEvent?: unknown) => {
    // Some Sigma builds emit `mouseup` for any button; only release on left.
    const wrapped = rawEvent as { original?: MouseEvent } | MouseEvent | undefined;
    const ev = (wrapped as { original?: MouseEvent } | undefined)?.original
      ?? (wrapped as MouseEvent | undefined);
    if (ev && typeof ev.button === 'number' && ev.button !== 0) return;
    if (!isDragging) return;
    isDragging = false;
    draggedNode = null;
    liveSim?.setDragged(null);
    if (container.value) container.value.style.cursor = '';
    // Intentionally NO reheat here — the previous behaviour (reheat 0.3)
    // injected fresh energy on release, which made nodes visibly drift
    // back toward the centroid. Letting the baseline alpha handle
    // everything keeps the dropped position stable.
  };
  sigma.getMouseCaptor().on('mouseup', handleUp as (c: unknown) => void);
  (sigma.getMouseCaptor() as unknown as {
    on(type: string, listener: (e?: unknown) => void): void;
  }).on('mouseupbody', handleUp);

  // --- Hover (suppressed during drag to avoid focus flicker) ---
  sigma.on('enterNode', ({ node }) => {
    if (isDragging) return;
    hoveredNode.value = node;
    if (container.value) container.value.style.cursor = 'pointer';
  });
  sigma.on('leaveNode', () => {
    if (isDragging) return;
    hoveredNode.value = null;
    if (container.value) container.value.style.cursor = '';
  });
  sigma.on('enterEdge', ({ edge }) => {
    if (isDragging) return;
    hoveredEdge.value = edge;
  });
  sigma.on('leaveEdge', () => {
    if (isDragging) return;
    hoveredEdge.value = null;
  });

  // --- Click / select / open ---
  sigma.on('clickNode', ({ node, event }) => {
    // Sigma fires clickNode after a drag too; ignore those.
    if (event.original && (event.original as MouseEvent).button !== 0) return;
    selected.value = buildSelected(graph, node);
    closeContextMenu();
  });
  sigma.on('doubleClickNode', ({ node, event }) => {
    event.preventSigmaDefault();
    openNote(node);
  });
  sigma.on('clickStage', () => {
    selected.value = null;
    closeContextMenu();
  });

  // --- Right-click → context menu (Sigma v3 native event) ---
  sigma.on('rightClickNode', ({ node, event }) => {
    event.preventSigmaDefault();
    event.original.preventDefault();
    event.original.stopPropagation();
    const orig = event.original as MouseEvent;
    contextMenu.visible = true;
    contextMenu.x = orig.clientX;
    contextMenu.y = orig.clientY;
    contextMenu.nodeId = node;
    contextMenu.stage = null;
    contextMenu.highlighted = Boolean(graph.getNodeAttribute(node, 'userHighlight'));
  });

  // Right-click on empty stage → "Create note here" menu. We snapshot the
  // graph-space coordinates so a future iteration can persist the position
  // (currently the new note simply opens in the editor — the position is
  // captured but not yet stored).
  sigma.on('rightClickStage', ({ event }) => {
    event.preventSigmaDefault();
    event.original.preventDefault();
    event.original.stopPropagation();
    const orig = event.original as MouseEvent;
    const graphCoords = sigma.viewportToGraph({ x: event.x, y: event.y });
    contextMenu.visible = true;
    contextMenu.x = orig.clientX;
    contextMenu.y = orig.clientY;
    contextMenu.nodeId = null;
    contextMenu.stage = { x: graphCoords.x, y: graphCoords.y };
    contextMenu.highlighted = false;
  });
  // NOTE: do NOT bind a generic `rightClick` handler that closes the menu —
  // it would fire immediately after `rightClickNode` and dismiss it.
  // Outside-click closure is handled by the document listener.
}

// ---------- Controls ----------

function reRunLayout() {
  const g = graphRef.value;
  const s = sigmaInstance.value;
  if (!g || !s) return;
  if (layoutMode.value === 'circular') {
    // Stop physics, place nodes on a circle, refresh once. Sim stays paused
    // so the circle is preserved until the user switches back to Force.
    liveSim?.pause();
    runCircularLayout(g);
    s.refresh();
    s.getCamera().animatedReset({ duration: 400 });
  } else {
    // Force = continuous physics. Resume the loop and inject fresh energy.
    liveSim?.resume();
    liveSim?.reheat(0.8);
    s.getCamera().animatedReset({ duration: 400 });
  }
}

function setLayout(mode: LayoutMode) {
  if (layoutMode.value === mode) return;
  layoutMode.value = mode;
  reRunLayout();
}

function setViewMode(mode: ViewMode) {
  if (viewMode.value === mode) return;
  viewMode.value = mode;
  // When the 2D canvas becomes visible after being mounted at width=0
  // (because the user started in 3D), Sigma needs a manual resize so it
  // picks up the real container dimensions. nextTick guarantees the
  // browser has flipped `display` before we measure.
  if (mode === '2d') {
    void nextTick(() => {
      const s = sigmaInstance.value;
      if (!s) return;
      s.resize();
      s.refresh();
      s.getCamera().animatedReset({ duration: 0 });
    });
  }
}

// ---------- 3D bridge handlers (mirror Sigma click/right-click flow) ----------

function on3DSelect(info: Graph3DSelected | null) {
  selected.value = info;
  closeContextMenu();
}

function on3DOpenNote(id: string) {
  openNote(id);
}

function on3DContextMenu(evt: { id: string; clientX: number; clientY: number; highlighted: boolean }) {
  contextMenu.visible = true;
  contextMenu.x = evt.clientX;
  contextMenu.y = evt.clientY;
  contextMenu.nodeId = evt.id;
  contextMenu.highlighted = evt.highlighted;
}

function on3DStageContextMenu(evt: { clientX: number; clientY: number }) {
  contextMenu.visible = true;
  contextMenu.x = evt.clientX;
  contextMenu.y = evt.clientY;
  contextMenu.nodeId = null;
  contextMenu.stage = null;
  contextMenu.highlighted = false;
}

function zoom(direction: 1 | -1) {
  if (viewMode.value === '3d') {
    graph3dRef.value?.zoom(direction);
    return;
  }
  const camera = sigmaInstance.value?.getCamera();
  if (!camera) return;
  const ratio = camera.ratio * (direction === 1 ? 0.7 : 1.4);
  camera.animate({ ratio }, { duration: 200 });
}

function fitToView() {
  if (viewMode.value === '3d') {
    graph3dRef.value?.zoomToFit();
    return;
  }
  sigmaInstance.value?.getCamera().animatedReset({ duration: 400 });
}

function homeView() {
  if (viewMode.value === '3d') {
    graph3dRef.value?.homeView();
    return;
  }
  sigmaInstance.value?.getCamera().animatedReset({ duration: 400 });
}

function toggleKindVisibility(kind: string) {
  if (hiddenKinds.has(kind)) hiddenKinds.delete(kind);
  else hiddenKinds.add(kind);
  sigmaInstance.value?.refresh();
}

function showAllKinds() {
  hiddenKinds.clear();
  sigmaInstance.value?.refresh();
}

function toggleFocusMode() {
  const next = !focusMode.value;
  const g = graphRef.value;
  if (next && !selected.value && hoveredNode.value && g?.hasNode(hoveredNode.value)) {
    selected.value = buildSelected(g, hoveredNode.value);
  }
  focusMode.value = next;
  sigmaInstance.value?.refresh();
}

function clearSearch() {
  searchQuery.value = '';
}

function openNote(id: string) {
  router.push({ path: '/', query: { note: id } });
}

/**
 * Stage right-click action: open the structured creation flow and then
 * load the created note. The graph-space coordinates captured by the
 * right-click handler aren't yet persisted (would require a
 * `note_positions` table); tracked here for that future migration.
 */
async function ctxCreateNoteHere(): Promise<void> {
  graphCreateStage.value = contextMenu.stage;
  graphCreateError.value = '';
  closeContextMenu();
  graphCreateOpen.value = true;
}

async function submitGraphCreate(payload: {
  title: string;
  kind: EntityKind;
  content: string;
  folderId: string | null;
}): Promise<void> {
  const stage = graphCreateStage.value;
  graphCreateBusy.value = true;
  graphCreateError.value = '';
  try {
    const created = await api.notes.create(payload);
    graphCreateOpen.value = false;
    void stage; // intentional: not yet persisted, see docstring above
    await load();
    openNote(created.id);
  } catch (err) {
    graphCreateError.value = err instanceof Error ? err.message : String(err);
    console.error('Failed to create note from graph stage', err);
  } finally {
    graphCreateBusy.value = false;
    graphCreateStage.value = null;
  }
}

// ---------- Context menu ----------

function closeContextMenu() {
  contextMenu.visible = false;
  contextMenu.nodeId = null;
}

function ctxOpenNote() {
  if (contextMenu.nodeId) openNote(contextMenu.nodeId);
  closeContextMenu();
}

function ctxToggleHighlight() {
  const g = graphRef.value;
  if (!g || !contextMenu.nodeId) return;
  const id = contextMenu.nodeId;
  const next = !contextMenu.highlighted;
  g.setNodeAttribute(id, 'userHighlight', next);
  // Mirror into the reactive set the 3D canvas watches.
  const nextSet = new Set(highlightedIds.value);
  if (next) nextSet.add(id); else nextSet.delete(id);
  highlightedIds.value = nextSet;
  contextMenu.highlighted = next;
  sigmaInstance.value?.refresh();
  closeContextMenu();
}

async function ctxRenameNote() {
  // Capture the target *before* closing the context menu — closeContextMenu
  // resets `contextMenu.nodeId` to null, which previously made the modal
  // open with no target and silently no-op'd on submit (the visible bug
  // the user reported as "Rename non funziona").
  const id = contextMenu.nodeId;
  const g = graphRef.value;
  if (!id || !g) return;
  renameModal.nodeId = id;
  renameModal.initial = String(g.getNodeAttribute(id, 'label') ?? '');
  renameModal.open = true;
  closeContextMenu();
}

async function submitRename(title: string) {
  const id = renameModal.nodeId;
  const g = graphRef.value;
  if (!id || !g) return;
  const next = title.trim();
  if (!next || next === renameModal.initial) return;
  try {
    await api.notes.update(id, { title: next });
    if (g.hasNode(id)) g.setNodeAttribute(id, 'label', next);
    if (selected.value && selected.value.id === id) selected.value.label = next;
    sigmaInstance.value?.refresh();
  } catch (err) {
    window.alert(`Rename failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function ctxDeleteNote() {
  const id = contextMenu.nodeId;
  const g = graphRef.value;
  if (!id || !g) return;
  deleteModal.nodeId = id;
  deleteModal.label = String(g.getNodeAttribute(id, 'label') ?? '(untitled)');
  deleteModal.open = true;
  closeContextMenu();
}

async function confirmDelete() {
  const id = deleteModal.nodeId;
  const g = graphRef.value;
  if (!id || !g) return;
  try {
    await api.notes.remove(id);
    if (g.hasNode(id)) g.dropNode(id);
    if (selected.value && selected.value.id === id) selected.value = null;
    stats.value = { nodes: g.order, edges: g.size };
    liveSim?.reheat(0.5);
    sigmaInstance.value?.refresh();
  } catch (err) {
    window.alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function ctxHideOtherKinds() {
  const g = graphRef.value;
  if (!g || !contextMenu.nodeId) return;
  const kind = String(g.getNodeAttribute(contextMenu.nodeId, 'kind') ?? 'custom');
  for (const k of kindStore.kinds.value) {
    if (k.id !== kind) hiddenKinds.add(k.id);
    else hiddenKinds.delete(k.id);
  }
  sigmaInstance.value?.refresh();
  closeContextMenu();
}

/**
 * Open the note picker so the user can link the right-clicked node to
 * one or more other notes. We snapshot every other node in the graph
 * and pre-disable nodes that already have an outbound edge from the
 * source — duplicate links are noise.
 */
function ctxLinkNote() {
  const g = graphRef.value;
  const id = contextMenu.nodeId;
  if (!g || !id) return;

  const already = new Set<string>();
  g.forEachOutEdge(id, (_e, _attrs, _src, tgt) => already.add(tgt));

  const entries: Array<{ id: string; label: string; kind?: string; disabled?: boolean }> = [];
  g.forEachNode((nid, attrs) => {
    if (nid === id) return;
    entries.push({
      id: nid,
      label: String((attrs as { label?: string }).label ?? '(untitled)'),
      kind: String((attrs as { kind?: string }).kind ?? 'custom'),
      disabled: already.has(nid),
    });
  });
  entries.sort((a, b) => a.label.localeCompare(b.label));

  linkModal.sourceId = id;
  linkModal.sourceLabel = String(g.getNodeAttribute(id, 'label') ?? '');
  linkModal.alreadyLinked = already;
  linkModal.entries = entries;
  linkModal.open = true;
  closeContextMenu();
}

/**
 * Persist the user's selections by appending real wikilinks
 * (`[[Target Title]]`) to the source note's body. The server's
 * `syncWikilinks` hook then materialises the corresponding rows in the
 * `links` table with `type='wikilink'`, so the new edges show up in
 * the graph *and* the wikilinks are visible inside the note when the
 * user opens it — exactly the same shape as links typed by hand.
 *
 * We intentionally avoid `POST /links` here: that creates orphan
 * `related` edges that don't appear anywhere in the document body,
 * which the user reported as confusing.
 */
async function submitLinks(targetIds: string[]) {
  const sourceId = linkModal.sourceId;
  if (!sourceId || targetIds.length === 0) return;
  linkBusy.value = true;
  try {
    // Build a label lookup from the snapshot taken when the modal opened.
    const labelById = new Map<string, string>();
    for (const e of linkModal.entries) labelById.set(e.id, e.label);

    // Fetch the source note so we can append to its current content
    // without clobbering whatever the user already wrote.
    const source = await api.notes.get(sourceId);
    const wikilinks = targetIds
      .map((id) => labelById.get(id) ?? '')
      .filter(Boolean)
      .map((label) => `[[${label}]]`)
      .join(' ');
    if (!wikilinks) return;

    const existing = (source.content ?? '').trimEnd();
    const separator = existing.length > 0 ? '\n\n' : '';
    const nextContent = `${existing}${separator}<p>${wikilinks}</p>`;

    await api.notes.update(sourceId, { content: nextContent });
    // syncWikilinks runs server-side; reload to pick up the new edges.
    await load();
  } catch (err) {
    window.alert(`Linking failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    linkBusy.value = false;
  }
}

// ---------- Keyboard shortcuts ----------

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))) return;
  if (e.key === '+' || e.key === '=') { zoom(1); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { zoom(-1); e.preventDefault(); }
  else if (e.key === '0') { fitToView(); e.preventDefault(); }
  else if (e.key === 'h' || e.key === 'H') { homeView(); e.preventDefault(); }
  else if (e.key === 'f' || e.key === 'F') { toggleFocusMode(); e.preventDefault(); }
  else if (e.key === 'Escape') {
    closeContextMenu();
    selected.value = null;
    sigmaInstance.value?.refresh();
  }
}

function onDocumentClick(e: MouseEvent) {
  // Auto-close the legend dropdown when clicking outside of it.
  if (legendOpen.value) {
    const target = e.target as HTMLElement | null;
    if (target && !target.closest?.('.legend-pop') && !target.closest?.('.legend-btn')) {
      legendOpen.value = false;
    }
  }
  if (!contextMenu.visible) return;
  const el = (e.target as HTMLElement | null)?.closest?.('.ctx-menu');
  if (!el) closeContextMenu();
}

function onDocumentContextMenu(e: MouseEvent) {
  // Close the menu when the user right-clicks anywhere outside the menu itself.
  if (!contextMenu.visible) return;
  const el = (e.target as HTMLElement | null)?.closest?.('.ctx-menu');
  if (!el) closeContextMenu();
}

// ---------- Watchers ----------

watch(searchQuery, () => {
  recomputeMatches();
  sigmaInstance.value?.refresh();
});

watch(focusMode, () => {
  sigmaInstance.value?.refresh({ skipIndexation: true });
});

watch([() => selected.value?.id, hoveredNode, hoveredEdge], () => {
  sigmaInstance.value?.refresh({ skipIndexation: true });
});

/**
 * Theme flip — Sigma caches `labelColor.color` and `defaultEdgeColor`
 * at construction time, so we reapply them when the palette ref
 * updates. The label/icon overlay is repainted automatically because
 * it reads `palette.value` on every draw.
 */
watch(palette, (next) => {
  const s = sigmaInstance.value;
  if (!s) return;
  s.setSetting('labelColor', { color: next.labelFg });
  s.setSetting('defaultEdgeColor', next.edge);
  s.refresh();
}, { deep: false });

// ---------- Lifecycle ----------

function preventNativeContextMenu(e: MouseEvent) { e.preventDefault(); }

/**
 * Global safety net: if the user releases the mouse outside the canvas
 * (e.g. over a toolbar or off the window), Sigma's captor may miss the
 * mouseup. We always release the drag here so the node never "sticks".
 */
function onWindowMouseUp(e: MouseEvent) {
  if (e.button !== 0) return;
  if (!isDragging) return;
  isDragging = false;
  draggedNode = null;
  liveSim?.setDragged(null);
  if (container.value) container.value.style.cursor = '';
  liveSim?.reheat(0.3);
}

onMounted(() => {
  load();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('click', onDocumentClick);
  window.addEventListener('contextmenu', onDocumentContextMenu);
  window.addEventListener('mouseup', onWindowMouseUp);
  container.value?.addEventListener('contextmenu', preventNativeContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('click', onDocumentClick);
  window.removeEventListener('contextmenu', onDocumentContextMenu);
  window.removeEventListener('mouseup', onWindowMouseUp);
  container.value?.removeEventListener('contextmenu', preventNativeContextMenu);
  liveSim?.stop();
  liveSim = null;
  sigmaInstance.value?.kill();
  sigmaInstance.value = null;
});
</script>

<template>
  <div class="graph-view">
    <div v-show="viewMode === '2d'" ref="container" class="canvas" />
    <Graph3DCanvas v-show="viewMode === '3d'" ref="graph3dRef" :payload="payload"
      :color-of="(k) => kindStore.colorOf(k)" :hidden-kinds="hiddenKinds" :highlighted-ids="highlightedIds"
      :search-query="searchQuery" :selected-id="selected?.id ?? null" :focus-mode="focusMode" @select="on3DSelect"
      @open-note="on3DOpenNote" @context-menu="on3DContextMenu" @stage-context-menu="on3DStageContextMenu" />

    <!-- Top-left: floating toolbar -->
    <div class="panel toolbar" @click.stop>
      <button class="tb-btn" :disabled="loading" title="Reload" @click="load">
        <Icon name="refresh" size="16" />
      </button>
      <span class="tb-sep" />
      <!-- View mode: 3D (neural-network) is the core base view. -->
      <button class="tb-btn" :class="{ active: viewMode === '3d' }" title="3D view — neural-network style"
        @click="setViewMode('3d')">
        <Icon name="cube" size="16" />
      </button>
      <button class="tb-btn" :class="{ active: viewMode === '2d' }" title="2D view — classic Sigma layout"
        @click="setViewMode('2d')">
        <Icon name="grid" size="16" />
      </button>
      <span v-if="viewMode === '2d'" class="tb-sep" />
      <button v-if="viewMode === '2d'" class="tb-btn" :class="{ active: layoutMode === 'force' }"
        title="Live physics — nodes float and self-organise" @click="setLayout('force')">
        <Icon name="activity" size="16" />
      </button>
      <button v-if="viewMode === '2d'" class="tb-btn" :class="{ active: layoutMode === 'circular' }"
        title="Freeze layout — pin nodes on a static ring" @click="setLayout('circular')">
        <Icon name="snowflake" size="16" />
      </button>
      <span class="tb-sep" />
      <button class="tb-btn" title="Zoom in (+)" @click="zoom(1)">
        <Icon name="zoom-in" size="16" />
      </button>
      <button class="tb-btn" title="Zoom out (−)" @click="zoom(-1)">
        <Icon name="zoom-out" size="16" />
      </button>
      <button class="tb-btn" title="Fit to view (0)" @click="fitToView">
        <Icon name="fit-screen" size="16" />
      </button>
      <button class="tb-btn" title="Home orientation (H)" @click="homeView">
        <Icon name="cube" size="16" />
      </button>
      <span class="tb-sep" />
      <button class="tb-btn" :class="{ active: focusMode }" title="Focus selected/hovered neighborhood (F)"
        @click="toggleFocusMode">
        <Icon :name="focusMode ? 'eye-off' : 'eye'" size="16" />
      </button>
      <span class="tb-sep" />
      <div class="tb-search">
        <UiInput v-model="searchQuery" size="sm" placeholder="Search nodes…" variant="bare" />
        <button v-if="searchQuery" class="tb-clear" @click="clearSearch" aria-label="Clear search">
          <Icon name="close" :size="12" />
        </button>
      </div>
    </div>

    <!-- Top-right: stacked rail (stats / legend / active filters) -->
    <div class="right-rail">
      <div class="panel stats-row" @click.stop>
        <span class="view-pill">
          <Icon :name="viewMode === '3d' ? 'cube' : 'grid'" :size="12" />
          {{ viewLabel }}
        </span>
        <span class="stats-pill">
          {{ stats.nodes }} nodes · {{ stats.edges }} edges
        </span>
        <button class="legend-btn" :class="{ open: legendOpen }" @click.stop="legendOpen = !legendOpen">
          <span>Legend</span>
          <Icon :name="legendOpen ? 'chevron-down' : 'chevron-right'" :size="14" class="chev" />
        </button>
      </div>
      <transition name="rail-pop">
        <div v-if="legendOpen" class="panel legend-pop" @click.stop>
          <div class="legend-head">
            <span>Entity kinds</span>
            <button v-if="hiddenKinds.size" class="legend-reset" @click="showAllKinds">
              Show all
            </button>
          </div>
          <div class="legend-body">
            <button v-for="k in kindStore.kinds.value" :key="k.id" class="legend-row"
              :class="{ off: hiddenKinds.has(k.id) }" @click="toggleKindVisibility(k.id)">
              <span class="dot" :style="{ background: k.color }" />
              <span>{{ k.label }}</span>
              <Icon :name="hiddenKinds.has(k.id) ? 'eye-off' : 'eye'" size="14" />
            </button>
          </div>
        </div>
      </transition>
      <div v-if="activeFilters.length" class="panel filter-chips" @click.stop>
        <div class="chips-head">
          <Icon name="filter" size="12" />
          <span>Hidden</span>
          <button class="chip-clear" @click="showAllKinds">Clear</button>
        </div>
        <div class="chips-body">
          <UiChip v-for="k in activeFilters" :key="k.id" removable @remove="toggleKindVisibility(k.id)">
            {{ k.label }}
          </UiChip>
        </div>
      </div>
    </div>

    <!-- Bottom-left: selected node card -->
    <div v-if="selected" class="selected-wrap" @click.stop>
      <UiCard padded>
        <div class="sel-head">
          <span class="dot" :style="{ background: kindStore.colorOf(selected.kind) }" />
          <Icon :name="iconNameOf(selected.kind)" size="14" />
          <span class="sel-kind">{{ kindStore.labelOf(selected.kind) }}</span>
          <button type="button" class="sel-close" title="Close (Esc)" aria-label="Close details"
            @click="selected = null">
            <Icon name="close" size="14" />
          </button>
        </div>
        <strong class="sel-title">{{ selected.label }}</strong>
        <div class="sel-meta">
          <span>In {{ selected.inDegree }}</span>
          <span class="dot-sep">·</span>
          <span>Out {{ selected.outDegree }}</span>
          <span class="dot-sep">·</span>
          <span>Wikilinks {{ selected.wikilinkCount }}</span>
          <span class="dot-sep">·</span>
          <span>Related {{ selected.relatedCount }}</span>
        </div>
        <UiButton variant="primary" size="sm" @click="openNote(selected.id)">
          <template #icon-left>
            <Icon name="node" size="14" />
          </template>
          Open note
        </UiButton>
      </UiCard>
    </div>

    <!-- Bottom-right: help pill -->
    <div class="help-pill" @mouseenter="helpOpen = true" @mouseleave="helpOpen = false">
      <Icon name="sparkles" size="14" />
      <span>Shortcuts</span>
      <div v-if="helpOpen" class="help-pop">
        <div><b>+ / −</b> zoom in / out</div>
        <div><b>0</b> fit to view</div>
        <div><b>H</b> home orientation</div>
        <div><b>F</b> focus selected neighborhood</div>
        <div><b>Esc</b> clear selection</div>
        <div><b>Drag</b> move node</div>
        <div><b>Right-click</b> node menu</div>
        <div><b>Double-click</b> open note</div>
      </div>
    </div>

    <!-- Right-click context menu -->
    <div v-if="contextMenu.visible" class="ctx-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <template v-if="contextMenu.nodeId">
        <button @click="ctxOpenNote">
          <Icon name="node" size="14" /> Open note
        </button>
        <button @click="ctxRenameNote">
          <Icon name="edit" size="14" /> Rename…
        </button>
        <button @click="ctxToggleHighlight">
          <Icon name="sparkles" size="14" />
          {{ contextMenu.highlighted ? 'Remove highlight' : 'Highlight node' }}
        </button>
        <button @click="ctxLinkNote">
          <Icon name="link" size="14" /> Link to note(s)…
        </button>
        <button @click="ctxHideOtherKinds">
          <Icon name="eye-off" size="14" /> Hide other kinds
        </button>
        <div class="ctx-sep" />
        <button class="danger" @click="ctxDeleteNote">
          <Icon name="trash" size="14" /> Delete note
        </button>
      </template>
      <template v-else>
        <button @click="ctxCreateNoteHere">
          <Icon name="plus" size="14" /> Create note here
        </button>
      </template>
    </div>

    <!-- Empty state -->
    <div v-if="isEmpty" class="empty">
      <UiCard padded>
        <UiEmpty title="Your graph is empty"
          description="Create a few notes and start linking them to see your world take shape.">
          <template #action>
            <UiButton variant="primary" @click="router.push('/')">
              + Create note
            </UiButton>
          </template>
        </UiEmpty>
      </UiCard>
    </div>

    <!-- Rename modal — replaces window.prompt -->
    <UiPromptModal v-model="renameModal.open" title="Rename note" label="Title" placeholder="Note title"
      :initial-value="renameModal.initial" confirm-label="Rename" @submit="submitRename" />

    <!-- Delete confirmation modal — replaces window.confirm -->
    <UiConfirmModal v-model="deleteModal.open" title="Delete note"
      :message="`Delete note “${deleteModal.label}”? This cannot be undone.`" confirm-label="Delete"
      confirm-variant="danger" @confirm="confirmDelete" />

    <!-- Link-from-graph modal — multi-pick targets to link to source node -->
    <UiNotePickerModal v-model="linkModal.open"
      :title="linkModal.sourceLabel ? `Link “${linkModal.sourceLabel}” to…` : 'Link notes'" :entries="linkModal.entries"
      :confirm-label="linkBusy ? 'Linking…' : 'Create links'" @submit="submitLinks" />

    <NoteCreateModal v-model="graphCreateOpen" :busy="graphCreateBusy" :error="graphCreateError" context="graph"
      @submit="submitGraphCreate" />
  </div>
</template>

<style scoped>
.graph-view {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 480px;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.canvas {
  position: absolute;
  inset: 0;
  background-color: var(--bg);
  background-image: radial-gradient(circle, var(--border-subtle) 1px, transparent 1px);
  background-size: 24px 24px;
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
}

/*
 * Sigma's `hoverNodes` WebGL layer redraws the hovered node's disc on top of
 * the `hovers` 2D canvas where our icon overlay lives — burying the glyph.
 * The regular `nodes` WebGL layer beneath already paints the disc, so hiding
 * `hoverNodes` is safe and lets our halo + icon + label pill sit above it.
 */
.canvas :deep(canvas.sigma-hoverNodes) {
  display: none !important;
}

.panel {
  position: absolute;
  background: var(--bg-elev);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  color: var(--fg);
  z-index: var(--z-raised);
  transition:
    opacity var(--duration-base) var(--ease-standard),
    transform var(--duration-base) var(--ease-standard),
    box-shadow var(--duration-base) var(--ease-standard);
}

/* ---- Toolbar ---- */
.toolbar {
  top: var(--space-7);
  left: var(--space-7);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  /* Wrap to a second row before colliding with the right-rail (~280px) so
   * neither panel ever overlaps the other on narrow viewports. */
  max-width: calc(100% - 320px - var(--space-7) * 2);
  flex-wrap: wrap;
  row-gap: var(--space-2);
}

.tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: var(--border-width-1) solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.tb-btn:hover:not(:disabled) {
  background: var(--bg-soft);
  color: var(--fg);
  border-color: var(--border);
}

.tb-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
}

.tb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tb-sep {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 var(--space-2);
}

.tb-search {
  display: flex;
  align-items: center;
  flex: 0 0 160px;
  min-width: 0;
  padding-left: var(--space-3);
  position: relative;
}

.tb-clear {
  position: absolute;
  right: var(--space-2);
  background: transparent;
  border: none;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: var(--text-lg);
  line-height: 1;
  padding: var(--space-1) var(--space-3);
}

.tb-clear:hover {
  color: var(--fg);
}

/* ---- Stats + legend ---- */
.right-rail {
  position: absolute;
  top: var(--space-7);
  right: var(--space-7);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-3);
  z-index: var(--z-raised);
  max-width: min(280px, calc(100vw - 2 * var(--space-7)));
}

.right-rail .panel {
  /* Inside the rail, panels stack naturally instead of layering. */
  position: static;
  width: 100%;
}

.stats-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
}

.view-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 26px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}

.stats-pill {
  font-size: var(--text-sm);
  color: var(--fg-muted);
  white-space: nowrap;
}

.legend-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: transparent;
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  color: var(--fg);
  cursor: pointer;
  transition: background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.legend-btn:hover,
.legend-btn.open {
  background: var(--bg-soft);
  border-color: var(--border-strong);
}

.chev {
  font-size: var(--text-2xs);
  color: var(--fg-muted);
}

.legend-pop {
  padding: var(--space-3);
  box-shadow: var(--shadow-lg);
}

.legend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3) var(--space-3);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--fg-muted);
  border-bottom: var(--border-width-1) solid var(--border);
  margin-bottom: var(--space-2);
}

.legend-reset {
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: var(--text-xs);
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
  padding: 0;
}

.legend-reset:hover {
  color: var(--accent-strong);
}

.legend-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.legend-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-base);
  background: transparent;
  border: var(--border-width-1) solid transparent;
  border-radius: var(--radius-sm);
  text-align: left;
  text-transform: capitalize;
  cursor: pointer;
  color: var(--fg);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.legend-row>span:nth-child(2) {
  flex: 1;
}

.legend-row:hover {
  background: var(--bg-soft);
}

.legend-row.off {
  opacity: 0.5;
}

.filter-chips {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) var(--space-4);
  box-shadow: var(--shadow-md);
}

.chips-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--fg-muted);
}

.chips-head>span {
  flex: 1;
}

.chips-body {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chip-clear {
  background: transparent;
  border: none;
  font-size: var(--text-xs);
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  text-transform: none;
  letter-spacing: 0;
}

.chip-clear:hover {
  color: var(--accent-strong);
}

/* Pop-in transition for the legend dropdown */
.rail-pop-enter-from,
.rail-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.rail-pop-enter-active,
.rail-pop-leave-active {
  transition:
    opacity var(--duration-base) var(--ease-standard),
    transform var(--duration-base) var(--ease-standard);
}

/* ---- Selected card ---- */
.selected-wrap {
  position: absolute;
  bottom: var(--space-7);
  left: var(--space-7);
  width: 300px;
  z-index: var(--z-raised);
}

.sel-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.sel-kind {
  text-transform: capitalize;
}

.sel-close {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: var(--border-width-1) solid transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.sel-close:hover {
  background: var(--bg-elev-2);
  color: var(--fg);
  border-color: var(--border);
}

.sel-close:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.sel-title {
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sel-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: var(--text-sm);
  color: var(--fg-muted);
}

.dot-sep {
  color: var(--fg-subtle);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-circle);
  display: inline-block;
  flex-shrink: 0;
}

/* ---- Help pill ---- */
.help-pill {
  position: absolute;
  bottom: var(--space-7);
  right: var(--space-7);
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-6);
  background: var(--bg-elev);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--fg-muted);
  box-shadow: var(--shadow-sm);
  z-index: var(--z-raised);
  cursor: help;
}

.help-pop {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: var(--bg-elev);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-5) var(--space-6);
  font-size: var(--text-sm);
  color: var(--fg);
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.help-pop b {
  color: var(--accent);
  margin-right: var(--space-3);
}

/* ---- Context menu ---- */
.ctx-menu {
  position: fixed;
  z-index: var(--z-popover);
  background: var(--bg-elev);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  min-width: 180px;
}

.ctx-menu button {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: transparent;
  border: none;
  padding: var(--space-4) var(--space-5);
  text-align: left;
  font-size: var(--text-base);
  color: var(--fg);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color var(--duration-fast) var(--ease-standard);
}

.ctx-menu button:hover {
  background: var(--bg-soft);
}

.ctx-menu button.danger {
  color: var(--danger);
}

.ctx-menu button.danger:hover {
  background: var(--danger-soft);
}

.ctx-sep {
  height: 1px;
  background: var(--border);
  margin: var(--space-2) var(--space-3);
}

/* ---- Empty state ---- */
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: var(--z-base);
}

.empty :deep(.ui-card) {
  pointer-events: auto;
  min-width: 320px;
}
</style>
