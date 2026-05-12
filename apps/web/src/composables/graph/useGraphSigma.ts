/**
 * Sigma instance + 2D ↔ 3D bridge orchestration for the Knowledge
 * Graph view.
 *
 * Owns:
 *   - The container ref and the live `Sigma` instance.
 *   - Raw payload + Graphology graph + per-load `liveSim` simulation.
 *   - Camera controls (zoom, fit, home, axis) routed to whichever
 *     renderer is currently visible (Sigma in 2D mode, the 3D canvas
 *     handle in 3D mode).
 *   - The `load()` cycle that re-fetches `links.graph()`, rebuilds
 *     the Graphology graph, restarts the d3-force simulation and
 *     re-applies persisted highlights.
 *
 * Receives every reactive dependency as input refs so this file is
 * agnostic to where the source state lives.
 */
import {
  nextTick,
  shallowRef,
  ref,
  watch,
  type Ref,
  type ShallowRef,
  type WatchStopHandle,
} from 'vue';
import {
  buildGraph,
  buildSigmaProgramSettings,
  runOrganicSeed,
  runCircularLayout,
  Sigma,
  startLiveSimulation,
  type Graph,
  type LiveSimulationHandle,
} from '@continuum/graph';
import { api } from '@/api';
import type { GraphEdge, GraphNode, KindDefinition } from '@continuum/shared';
import type { AppIconName as IconName } from '@/assets/icons';
import type { GraphPalette } from '@/composables/useGraphPalette';
import type { UseGraphFiltersReturn } from './useGraphFilters';
import type { UseGraphPreferencesReturn, LayoutMode, ViewMode } from './useGraphPreferences';
import type { UseGraphSelectionReturn } from './useGraphSelection';
import { applyReducers, computeProminence } from '@/components/graph/graphReducers';
import { makeHoverRenderer, makeLabelRenderer } from '@/components/graph/graphLabelRenderer';
import { bindInteractions } from '@/components/graph/graphInteractions';
import {
  computeLodTier,
  lodDensity2D,
  LOD_RECOMPUTE_THROTTLE_MS,
  type LodTier,
} from '@/components/graph/lodConfig';

export type GraphAxisView = 'x' | 'y' | 'z';

/** Imperative handle exposed by `Graph3DCanvas.vue` via `defineExpose`. */
export interface Graph3DHandle {
  zoom(direction: 1 | -1): void;
  zoomToFit(): void;
  homeView(): void;
  focusNode(id: string): boolean;
  viewAlongAxis(axis: GraphAxisView): void;
}

export interface UseGraphSigmaOptions {
  prefs: UseGraphPreferencesReturn;
  filters: UseGraphFiltersReturn;
  selection: UseGraphSelectionReturn;
  palette: ShallowRef<GraphPalette>;
  graph3dRef: Ref<Graph3DHandle | null>;
  /** Kind registry. Provides icon/color lookup and the kinds list. */
  kindStore: {
    load(force?: boolean): Promise<void>;
    kinds: Ref<KindDefinition[]>;
    colorOf(id: string): string;
    iconOf(id: string): string;
  };
  /** Right-click handler — caller opens its context menu state. */
  onContextMenu(evt: { id: string; clientX: number; clientY: number; highlighted: boolean }): void;
  /** Open a note (router push). */
  onOpenNote(id: string): void;
  /** Close the context menu (called on click + escape + reload). */
  onCloseContextMenu(): void;
}

export interface UseGraphSigmaReturn {
  container: Ref<HTMLDivElement | null>;
  sigmaInstance: ShallowRef<Sigma | null>;
  graphRef: ShallowRef<Graph | null>;
  payload: ShallowRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>;
  stats: Ref<{ nodes: number; edges: number }>;
  loading: Ref<boolean>;
  prominentNodeIds: ShallowRef<Set<string>>;
  prominentEdgeIds: ShallowRef<Set<string>>;
  load(): Promise<void>;
  reRunLayout(): void;
  setLayout(mode: LayoutMode): void;
  setViewMode(mode: ViewMode): void;
  zoom(direction: 1 | -1): void;
  fitToView(): void;
  homeView(): void;
  viewGraph3DAxis(axis: GraphAxisView): void;
  focusNodeInCurrentView(id: string): void;
  /** Refresh the renderer (skipping indexation). */
  refresh(): void;
  /** Mount-time bring-up: window listeners, contextmenu suppression. */
  attach(): void;
  /** Tear-down: undo `attach()` and kill sigma + simulation. */
  detach(): void;
}

export function useGraphSigma(opts: UseGraphSigmaOptions): UseGraphSigmaReturn {
  const { prefs, filters, selection, palette, graph3dRef, kindStore } = opts;

  const container = ref<HTMLDivElement | null>(null);
  const sigmaInstance = shallowRef<Sigma | null>(null);
  const graphRef = shallowRef<Graph | null>(null);
  const payload = shallowRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const stats = ref<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 });
  const loading = ref<boolean>(false);
  const prominentNodeIds = shallowRef<Set<string>>(new Set<string>());
  const prominentEdgeIds = shallowRef<Set<string>>(new Set<string>());
  // Live LOD tier driven by node count + Sigma camera ratio. Tracked in
  // a plain ref so we can throttle camera-update recomputes without
  // burning a Vue watcher on every frame.
  const lodTier = ref<LodTier>('near');
  let lastLodComputeAt = 0;
  let lodPending = false;

  function recomputeLodTier(): void {
    const sigma = sigmaInstance.value;
    const ratio = sigma ? sigma.getCamera().ratio : 1;
    const enabled = filters.filters.lodEnabled;
    const next: LodTier = enabled
      ? computeLodTier(lodDensity2D(stats.value.nodes, ratio))
      : 'near';
    if (next !== lodTier.value) {
      lodTier.value = next;
      sigma?.refresh({ skipIndexation: true });
    }
  }

  /** Throttled to ~30fps so camera animations stay smooth. */
  function scheduleLodRecompute(): void {
    const now = performance.now();
    if (now - lastLodComputeAt >= LOD_RECOMPUTE_THROTTLE_MS) {
      lastLodComputeAt = now;
      recomputeLodTier();
      return;
    }
    if (lodPending) return;
    lodPending = true;
    window.setTimeout(() => {
      lodPending = false;
      lastLodComputeAt = performance.now();
      recomputeLodTier();
    }, LOD_RECOMPUTE_THROTTLE_MS);
  }

  let liveSim: LiveSimulationHandle | null = null;
  let interactions: ReturnType<typeof bindInteractions> | null = null;

  function refresh(): void {
    sigmaInstance.value?.refresh();
  }

  /**
   * Sigma's `labelRenderedSizeThreshold` decides which labels are
   * visible at the current zoom: nodes whose on-screen size is below
   * the threshold have their label clipped. Slider 0 → 16px floor
   * (almost no labels), slider 1 → 4px (almost all).
   */
  function applyAdaptiveLabelThreshold(): void {
    const s = sigmaInstance.value;
    if (!s) return;
    // The fade-threshold slider is always the source of truth: even
    // when "Mostra nomi nodi" or "Icone categorie" are on, labels and
    // icons must fade out at zoom-out exactly as the user dragged the
    // slider. The previous short-circuit (`labelRenderedSizeThreshold = 0`)
    // pinned every label visible regardless of the slider value.
    const wantsAlwaysOn = filters.filters.showNodeLabels || filters.filters.showNodeIcons;
    s.setSetting('labelDensity', wantsAlwaysOn ? 1 : 0.16);
    const threshold = 16 - filters.filters.labelFadeThreshold * 12;
    s.setSetting('labelRenderedSizeThreshold', threshold);
  }

  async function load(): Promise<void> {
    if (!container.value) return;
    loading.value = true;
    try {
      await kindStore.load();
      prefs.pruneHiddenKinds(kindStore.kinds.value.map((k) => k.id));
      const data = await api.links.graph();
      const storedHighlights = prefs.loadHighlights();
      prefs.highlightedIds.value = storedHighlights;
      payload.value = { nodes: data.nodes, edges: data.edges };
      const g = buildGraph({
        ...data,
        colorResolver: (k) => kindStore.colorOf(k),
        // Skip the offline force pass — the live simulation will
        // animate the graph from the seeded positions.
        runLayout: false,
      });
      if (prefs.layoutMode.value === 'circular') runCircularLayout(g);
      else runOrganicSeed(g);
      const prominence = computeProminence(g);
      prominentNodeIds.value = prominence.nodes;
      prominentEdgeIds.value = prominence.edges;
      prefs.applyStoredHighlights(g, storedHighlights);
      graphRef.value = g;
      stats.value = { nodes: g.order, edges: g.size };

      sigmaInstance.value?.kill();
      liveSim?.stop();
      liveSim = null;
      selection.selected.value = null;
      selection.hoveredNode.value = null;
      selection.hoveredEdge.value = null;
      filters.matchedNodes.value = new Set<string>();
      opts.onCloseContextMenu();

      if (g.order === 0) {
        prominentNodeIds.value = new Set<string>();
        prominentEdgeIds.value = new Set<string>();
        sigmaInstance.value = null;
        return;
      }

      // Sigma v3 hard-codes `antialias: false` on the WebGL context it
      // creates internally — which means every disc, edge and arrowhead
      // is drawn without hardware multi-sampling and reads as visibly
      // pixelated, especially at fractional DPRs (e.g. Windows 156%
      // scaling). Temporarily patch `getContext` so Sigma's canvases
      // request hardware MSAA, then restore the original immediately.
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function patchedGetContext(
        this: HTMLCanvasElement,
        type: string,
        attrs?: WebGLContextAttributes & CanvasRenderingContext2DSettings,
      ) {
        if (type === 'webgl2' || type === 'webgl') {
          return origGetContext.call(this, type, {
            ...(attrs ?? {}),
            antialias: true,
            powerPreference: 'high-performance',
          } as WebGLContextAttributes) as RenderingContext | null;
        }
        return origGetContext.call(this, type as '2d', attrs as CanvasRenderingContext2DSettings) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;

      const sigma = new Sigma(g, container.value, {
        ...buildSigmaProgramSettings(),
        // Sigma's WebGL `hoverNodes` layer falls back to the regular
        // bordered program when no hover-specific class is provided
        // here, repainting the hovered node above our 2D `hovers`
        // canvas. The regular `nodes` layer already shows the disc,
        // so we defang this by hiding the `hoverNodes` canvas via
        // CSS (`canvas.sigma-hoverNodes { display: none }`).
        nodeHoverProgramClasses: {},
        // The 2D container is `v-show`-hidden while the user stays in
        // 3D mode — width is 0 at construction time. Without this
        // flag Sigma throws "Container has no width". We refresh the
        // renderer when the user actually switches to 2D, so the
        // geometry is correct by the time it becomes visible.
        allowInvalidContainer: true,
        renderEdgeLabels: false,
        labelColor: { color: palette.value.labelFg },
        labelSize: 11,
        labelWeight: '500',
        labelFont: 'Inter, system-ui, sans-serif',
        labelDensity: 0.16,
        labelGridCellSize: 168,
        labelRenderedSizeThreshold: 8.5,
        defaultEdgeColor: palette.value.edge,
        // Clamp edge thickness on screen so links remain crisp at any
        // zoom level — the "spider web" effect at zoom-out happens
        // when Sigma renders sub-pixel thin edges.
        minEdgeThickness: 1.5,
        // With hardware MSAA enabled (via webGLContextAttributes above),
        // a touch of fragment-shader feather still helps soften the
        // outer rim of node discs at fractional DPRs without blurring
        // them. 1.0 was a safe baseline; 1.25 trades a hair of crispness
        // for a noticeably smoother edge on both node discs and link
        // strokes (the same feather is consumed by Sigma's edge program).
        antiAliasingFeather: 1.25,
        stagePadding: 104,
        zIndex: true,
      });
      // Restore the native getContext now that every Sigma canvas has
      // been created with the MSAA-enabled WebGL context.
      HTMLCanvasElement.prototype.getContext = origGetContext;
      sigmaInstance.value = sigma;

      const labelCtx = (): { palette: GraphPalette; iconOf: (k: string) => IconName } => ({
        palette: palette.value,
        iconOf: (k) => kindStore.iconOf(k) as IconName,
      });
      sigma.setSetting(
        'defaultDrawNodeLabel',
        makeLabelRenderer(sigma, labelCtx) as Parameters<typeof sigma.setSetting<'defaultDrawNodeLabel'>>[1],
      );
      sigma.setSetting(
        'defaultDrawNodeHover',
        makeHoverRenderer(sigma, labelCtx) as Parameters<typeof sigma.setSetting<'defaultDrawNodeHover'>>[1],
      );

      applyReducers(sigma, g, () => ({
        filters: {
          hideOrphans: filters.filters.hideOrphans,
          monochrome: filters.filters.monochrome,
          arrows: filters.filters.arrows,
          showNodeLabels: filters.filters.showNodeLabels,
          showNodeIcons: filters.filters.showNodeIcons,
          nodeSizeMultiplier: filters.filters.nodeSizeMultiplier,
          edgeSizeMultiplier: filters.filters.edgeSizeMultiplier,
          solidNodes: filters.filters.solidNodes,
        },
        hiddenKinds: prefs.hiddenKinds,
        matchedNodes: filters.matchedNodes.value,
        searchQuery: filters.searchQuery.value,
        prominentNodeIds: prominentNodeIds.value,
        prominentEdgeIds: prominentEdgeIds.value,
        selectedId: selection.selected.value?.id ?? null,
        hoveredNode: selection.hoveredNode.value,
        hoveredEdge: selection.hoveredEdge.value,
        palette: palette.value,
        lodTier: lodTier.value,
      }));
      applyAdaptiveLabelThreshold();
      // Hook the Sigma camera so panning / zooming refreshes the tier.
      sigma.getCamera().on('updated', scheduleLodRecompute);
      // Initial sync — dataset just loaded, derive tier from node count.
      recomputeLodTier();

      // Continuous Obsidian-style spring physics. The simulation runs
      // on its own rAF loop and refreshes Sigma each tick.
      liveSim = startLiveSimulation(g, {
        linkDistance: filters.filters.linkDistance,
        chargeStrength: filters.filters.repelForce,
        chargeDistanceMax: 1200,
        gravity: filters.filters.centerForce,
        linkStrength: filters.filters.linkForce > 0 ? filters.filters.linkForce : null,
        velocityDecay: 0.42,
        alphaDecay: 0.0228,
        alphaMin: 0.001,
        onTick: () => sigma.refresh({ skipIndexation: true }),
        // When the simulation cools below alphaMin (just like d3's
        // `end` event), gently re-frame the camera so the freshly
        // resolved layout sits centred in the viewport.
        onEnd: () => sigma.getCamera().animatedReset({ duration: 600 }),
      });
      // Bind drag/hover/click handlers AFTER the liveSim handle exists
      // so drag callbacks can drive `liveSim.setDragged(...)` directly.
      interactions = bindInteractions(sigma, g, liveSim, {
        onSelectNode: (id) => {
          selection.selected.value = selection.buildSelected(g, id);
          opts.onCloseContextMenu();
        },
        onOpenNote: (id) => opts.onOpenNote(id),
        onClickStage: () => {
          selection.selected.value = null;
          opts.onCloseContextMenu();
        },
        onContextMenu: opts.onContextMenu,
        onHoverNode: (id) => { selection.hoveredNode.value = id; },
        onHoverEdge: (id) => { selection.hoveredEdge.value = id; },
        container: () => container.value,
      });
      if (prefs.layoutMode.value === 'circular') liveSim.pause();
    } finally {
      loading.value = false;
    }
  }

  function reRunLayout(): void {
    const g = graphRef.value;
    const s = sigmaInstance.value;
    if (!g || !s) return;
    if (prefs.layoutMode.value === 'circular') {
      // Stop physics, place nodes on a circle, refresh once. Sim stays
      // paused so the circle is preserved until the user switches back
      // to Force.
      liveSim?.pause();
      runCircularLayout(g);
      s.refresh();
      s.getCamera().animatedReset({ duration: 400 });
    } else {
      // Force = organic seed plus continuous d3-force-style physics.
      runOrganicSeed(g);
      liveSim?.resume();
      liveSim?.reheat(1);
      s.getCamera().animatedReset({ duration: 400 });
    }
  }

  function setLayout(mode: LayoutMode): void {
    if (prefs.layoutMode.value === mode) return;
    prefs.layoutMode.value = mode;
    reRunLayout();
  }

  function setViewMode(mode: ViewMode): void {
    if (prefs.viewMode.value === mode) return;
    prefs.viewMode.value = mode;
    // When the 2D canvas becomes visible after being mounted at
    // width=0 (because the user started in 3D), Sigma needs a manual
    // resize so it picks up the real container dimensions.
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

  function zoom(direction: 1 | -1): void {
    if (prefs.viewMode.value === '3d') {
      graph3dRef.value?.zoom(direction);
      return;
    }
    const camera = sigmaInstance.value?.getCamera();
    if (!camera) return;
    const ratio = camera.ratio * (direction === 1 ? 0.7 : 1.4);
    camera.animate({ ratio }, { duration: 200 });
  }

  function fitToView(): void {
    if (prefs.viewMode.value === '3d') {
      graph3dRef.value?.zoomToFit();
      return;
    }
    sigmaInstance.value?.getCamera().animatedReset({ duration: 400 });
  }

  function homeView(): void {
    if (prefs.viewMode.value === '3d') {
      graph3dRef.value?.homeView();
      return;
    }
    sigmaInstance.value?.getCamera().animatedReset({ duration: 400 });
  }

  function viewGraph3DAxis(axis: GraphAxisView): void {
    if (prefs.viewMode.value !== '3d') return;
    graph3dRef.value?.viewAlongAxis(axis);
  }

  function focusNodeInCurrentView(id: string): void {
    const g = graphRef.value;
    if (!g || !g.hasNode(id)) return;
    if (prefs.viewMode.value === '3d') {
      graph3dRef.value?.focusNode(id);
      return;
    }
    const sigma = sigmaInstance.value;
    if (!sigma) return;
    // Sigma's camera uses its own normalized coordinate system, not the raw
    // graph attributes (which live in d3-force pixel space). `getNodeDisplayData`
    // returns the node's position in that camera space — exactly what
    // `camera.animate({ x, y })` expects. Using raw graph x/y here lands the
    // camera far outside the visible viewport (looks like "nodes vanished").
    const display = sigma.getNodeDisplayData(id);
    if (!display || !Number.isFinite(display.x) || !Number.isFinite(display.y)) return;
    sigma.getCamera().animate(
      { x: display.x, y: display.y, ratio: 0.42 },
      { duration: 450 },
    );
  }

  // ---------- Window-level listeners ----------

  function preventNativeContextMenu(e: MouseEvent): void {
    e.preventDefault();
  }

  /**
   * Global safety net: if the user releases the mouse outside the
   * canvas (e.g. over a toolbar or off the window), Sigma's captor
   * may miss the mouseup. We always release the drag here so the
   * node never "sticks".
   */
  function onWindowMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (!interactions || !interactions.isDragging()) return;
    interactions.releaseDrag();
    liveSim?.reheat(0.08);
  }

  let watchers: WatchStopHandle[] = [];

  function attach(): void {
    void load();
    window.addEventListener('mouseup', onWindowMouseUp);
    container.value?.addEventListener('contextmenu', preventNativeContextMenu);

    // Watcher: search query → recompute matches + refresh.
    watchers.push(
      watch(filters.searchQuery, () => {
        filters.recomputeMatches(graphRef.value);
        sigmaInstance.value?.refresh();
      }),
    );

    // Watcher: selection / hover changes → re-paint reducers.
    watchers.push(
      watch(
        [() => selection.selected.value?.id, selection.hoveredNode, selection.hoveredEdge],
        () => sigmaInstance.value?.refresh({ skipIndexation: true }),
      ),
    );

    // Watcher: visual filters (cheap).
    watchers.push(
      watch(
        () => ({
          hideOrphans: filters.filters.hideOrphans,
          monochrome: filters.filters.monochrome,
          arrows: filters.filters.arrows,
          labelFadeThreshold: filters.filters.labelFadeThreshold,
          showNodeLabels: filters.filters.showNodeLabels,
          showNodeIcons: filters.filters.showNodeIcons,
          nodeSizeMultiplier: filters.filters.nodeSizeMultiplier,
          edgeSizeMultiplier: filters.filters.edgeSizeMultiplier,
          solidNodes: filters.filters.solidNodes,
          lodEnabled: filters.filters.lodEnabled,
        }),
        () => {
          filters.saveFilters();
          applyAdaptiveLabelThreshold();
          recomputeLodTier();
          sigmaInstance.value?.refresh();
        },
        { deep: true },
      ),
    );

    // Watcher: forces (drives liveSim.setOptions; reheats).
    watchers.push(
      watch(
        () => ({
          centerForce: filters.filters.centerForce,
          repelForce: filters.filters.repelForce,
          linkForce: filters.filters.linkForce,
          linkDistance: filters.filters.linkDistance,
        }),
        (next) => {
          filters.saveFilters();
          if (!liveSim) return;
          liveSim.setOptions({
            gravity: next.centerForce,
            chargeStrength: next.repelForce,
            // d3 link.strength is `null` for "use default count-based stiffness".
            linkStrength: next.linkForce > 0 ? next.linkForce : null,
            linkDistance: next.linkDistance,
          });
          liveSim.reheat(0.6);
        },
        { deep: true },
      ),
    );

    // Watcher: theme flip — Sigma caches `labelColor.color` and
    // `defaultEdgeColor` at construction time, so reapply when the
    // palette ref updates.
    watchers.push(
      watch(palette, (next) => {
        const s = sigmaInstance.value;
        if (!s) return;
        s.setSetting('labelColor', { color: next.labelFg });
        s.setSetting('defaultEdgeColor', next.edge);
        s.refresh();
      }, { deep: false }),
    );
  }

  function detach(): void {
    for (const stop of watchers) stop();
    watchers = [];
    window.removeEventListener('mouseup', onWindowMouseUp);
    container.value?.removeEventListener('contextmenu', preventNativeContextMenu);
    liveSim?.stop();
    liveSim = null;
    sigmaInstance.value?.kill();
    sigmaInstance.value = null;
  }

  return {
    container,
    sigmaInstance,
    graphRef,
    payload,
    stats,
    loading,
    prominentNodeIds,
    prominentEdgeIds,
    load,
    reRunLayout,
    setLayout,
    setViewMode,
    zoom,
    fitToView,
    homeView,
    viewGraph3DAxis,
    focusNodeInCurrentView,
    refresh,
    attach,
    detach,
  };
}
