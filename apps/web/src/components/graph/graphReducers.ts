/**
 * Sigma node/edge reducers + small colour helpers used by the 2D
 * Knowledge Graph view. Pure logic — no Vue, no DOM. Reactive state
 * is read through the `getCtx()` snapshot the reducers are given,
 * so the renderer always paints the latest values without each
 * change re-installing a fresh closure on Sigma.
 */
import { highlightNeighbors, type Graph, type Sigma } from '@continuum/graph';
import { graphDisplayLabel } from '@/utils/graphLabels';
import type { GraphPalette } from '@/composables/useGraphPalette';
import type { LodTier } from './lodConfig';

/** Subset of the persisted Filtri state that the reducers consume. */
export interface ReducerFiltersSnapshot {
  hideOrphans: boolean;
  monochrome: boolean;
  arrows: boolean;
  showNodeLabels: boolean;
  showNodeIcons: boolean;
  nodeSizeMultiplier: number;
  edgeSizeMultiplier: number;
  /**
   * When `true` (default), nodes render as filled discs in their kind
   * colour. When `false`, nodes switch to a hollow `ring` rendering:
   * the kind colour migrates to a thicker outer border and the inner
   * fill is replaced with the canvas background so topology reads
   * over chroma (Roam / Logseq style).
   */
  solidNodes: boolean;
}

export interface ReducerContext {
  filters: ReducerFiltersSnapshot;
  hiddenKinds: Set<string>;
  matchedNodes: Set<string>;
  /** Raw `searchQuery` string — used to detect "has a query" without matches. */
  searchQuery: string;
  prominentNodeIds: Set<string>;
  prominentEdgeIds: Set<string>;
  selectedId: string | null;
  hoveredNode: string | null;
  hoveredEdge: string | null;
  palette: GraphPalette;
  /** Current LOD tier; reducers gate detail rendering off this. */
  lodTier: LodTier;
}

type NodeVisualAttrs = Record<string, unknown> & {
  color?: string;
  label?: string;
  size?: number;
  type?: string;
  forceLabel?: boolean;
  zIndex?: number;
  borderColor?: string;
  dimmed?: boolean;
  showIcon?: boolean;
  showLabel?: boolean;
};

/** Hover trumps selection for the focus subgraph. */
function activeFocusId(ctx: ReducerContext): string | null {
  return ctx.hoveredNode ?? ctx.selectedId;
}

export function colorWithAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  const rgba = /^rgba\(([^)]+)\)$/i.exec(color.trim());
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => p.trim());
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamped})`;
  }
  const rgb = /^rgb\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) return `rgba(${rgb[1]}, ${clamped})`;
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamped})`;
  }
  return color;
}

type RgbColor = { r: number; g: number; b: number };

function parseRgbColor(color: string): RgbColor | null {
  const trimmed = color.trim();
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(trimmed);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => Number.parseFloat(p.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (!hex) return null;
  const n = Number.parseInt(hex[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixOpaqueColor(foreground: string, background: string, amount: number): string {
  const fg = parseRgbColor(foreground);
  const bg = parseRgbColor(background);
  if (!fg || !bg) return foreground;
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(bg.r + (fg.r - bg.r) * t);
  const g = Math.round(bg.g + (fg.g - bg.g) * t);
  const b = Math.round(bg.b + (fg.b - bg.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

export function computeProminence(graph: Graph): { nodes: Set<string>; edges: Set<string> } {
  const ranked: Array<{ id: string; degree: number; label: string }> = [];
  graph.forEachNode((id, attrs) => {
    ranked.push({
      id,
      degree: graph.degree(id),
      label: String((attrs as { label?: unknown }).label ?? ''),
    });
  });
  ranked.sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));

  const visibleLabelBudget = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(graph.order))));
  const nodes = new Set<string>();
  const seenLabels = new Set<string>();
  for (const item of ranked) {
    if (nodes.size >= visibleLabelBudget) break;
    if (item.degree <= 0 && nodes.size >= 4) continue;
    const labelKey = item.label.trim().toLowerCase();
    if (labelKey && seenLabels.has(labelKey)) continue;
    nodes.add(item.id);
    if (labelKey) seenLabels.add(labelKey);
  }

  const edges = new Set<string>();
  graph.forEachEdge((edge, _attrs, source, target) => {
    if (nodes.has(source) || nodes.has(target)) edges.add(edge);
  });
  return { nodes, edges };
}

/**
 * Install Sigma node + edge reducers that read every reactive value
 * through the `getCtx()` snapshot. Called once at sigma construction;
 * Sigma re-invokes the reducers on every refresh so changes to
 * filters / hiddenKinds / matches / hover / selection take effect
 * without re-installing them.
 */
export function applyReducers(
  sigma: Sigma,
  graph: Graph,
  getCtx: () => ReducerContext,
): void {
  sigma.setSetting('nodeReducer', (node, data) => {
    const ctx = getCtx();
    const { filters, hiddenKinds, matchedNodes, searchQuery, prominentNodeIds, palette: pal, lodTier } = ctx;
    const res: NodeVisualAttrs = { ...data };
    const kind = String((data as { kind?: string }).kind ?? 'custom');
    const baseSize = Number((data as { baseSize?: number }).baseSize ?? data.size ?? 14);
    const rawLabel = String((data as { label?: string }).label ?? '');
    // Monochrome mode collapses every kind to the neutral default shade so
    // the user can read pure topology without the chromatic noise.
    const kindColor = String((data as { color?: string }).color ?? pal.accent);
    const baseColor = filters.monochrome ? pal.nodeDefault : kindColor;
    const isProminent = prominentNodeIds.has(node);
    const isFocusOrSelected = ctx.selectedId === node || ctx.hoveredNode === node;
    let showLabel = false;
    let showIcon = false;
    // STRICT UNIFORMITY: every node renders at exactly the same radius.
    // The only branch allowed to deviate is the user-highlight path
    // below. Selection, hover, focus, search-match, prominence — none
    // of them bump size or stroke; they only modulate colour / z-index
    // / borders so the visual hierarchy never produces "fat" nodes.
    const uniformSize = baseSize * filters.nodeSizeMultiplier;
    res.color = baseColor;
    res.size = uniformSize;
    res.label = '';
    if (filters.solidNodes) {
      res.type = 'bordered';
      res.borderColor = 'rgba(0,0,0,0)';
    } else {
      res.type = 'hollow';
      res.borderColor = baseColor;
      res.color = pal.bg;
    }

    if (filters.showNodeLabels) showLabel = true;
    if (filters.showNodeIcons) showIcon = true;

    // 1. Hidden kind → near-invisible micro dot, no label, no icon.
    if (hiddenKinds.has(kind)) {
      res.color = pal.nodeHidden;
      res.size = uniformSize * 0.35;
      res.label = '';
      res.zIndex = 0;
      res.dimmed = true;
      return res;
    }

    // 1b. Orphan filter — hide isolated nodes when active.
    if (filters.hideOrphans && graph.degree(node) === 0) {
      res.color = 'rgba(0,0,0,0)';
      res.size = 0;
      res.label = '';
      res.zIndex = -1;
      res.dimmed = true;
      return res;
    }

    // 2. Search filter — keep non-matches visible but desaturated.
    //    Matches keep the uniform size; only colour + z-index reflect the hit.
    const hasQuery = matchedNodes.size > 0 || searchQuery.trim().length > 0;
    if (hasQuery && !matchedNodes.has(node)) {
      res.color = pal.nodeDim;
      res.dimmed = true;
    } else if (hasQuery && matchedNodes.has(node)) {
      res.color = baseColor;
      res.zIndex = 2;
      showLabel = true;
      showIcon = true;
    }

    // 3. Selection / hover focus — promote z-index but keep size uniform.
    const focusId = activeFocusId(ctx);
    const isUserHighlighted = Boolean((data as { userHighlight?: boolean }).userHighlight);
    let isOutOfFocus = false;
    if (!focusId && !hasQuery && isProminent) {
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 1);
    }
    if (focusId) {
      const { nodes } = highlightNeighbors(graph, focusId);
      const inSet = nodes.has(node);
      if (!inSet) {
        isOutOfFocus = true;
        // Out-of-focus nodes use one uniform dim shade — no selected,
        // persisted-highlight or kind-colour exceptions — so the focus
        // subgraph is the only non-background visual system on screen.
        const dimUniform = mixOpaqueColor(pal.nodeDefault, pal.bg, 0.34);
        res.color = dimUniform;
        if (!filters.solidNodes) {
          res.borderColor = dimUniform;
        }
        res.label = '';
        res.zIndex = 0;
        res.dimmed = true;
        showLabel = false;
        showIcon = false;
      } else if (node === focusId) {
        res.color = baseColor;
        res.zIndex = 3;
        showLabel = true;
        showIcon = true;
      } else {
        res.color = baseColor;
        res.zIndex = 2;
        showLabel = true;
        showIcon = true;
      }
    }

    if (!isOutOfFocus && ctx.selectedId === node) {
      res.color = baseColor;
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 2);
      res.borderColor = pal.edgeFocus;
      showLabel = true;
      showIcon = true;
    }

    // 4. Persistent user highlight — the ONLY exception to uniform size.
    if (!isOutOfFocus && isUserHighlighted) {
      res.color = baseColor;
      res.size = uniformSize * 1.28;
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 3);
      res.borderColor = pal.accent;
      showLabel = true;
      showIcon = true;
    }

    if (showLabel || showIcon) {
      // LOD gate — in `mid` / `far` tiers, suppress all labels except
      // the actively hovered or selected node. Search matches in `mid`
      // remain (user is hunting); in `far` only focus/selection survive.
      const allowLabel = filters.showNodeLabels
        || isUserHighlighted
        || lodTier === 'near'
        || isFocusOrSelected
        || (lodTier === 'mid' && (matchedNodes.has(node) || prominentNodeIds.has(node)));
      if (allowLabel || showIcon) res.label = graphDisplayLabel(rawLabel, 32) || ' ';
      res.showLabel = showLabel && allowLabel;
      // `forceLabel` makes Sigma bypass `labelRenderedSizeThreshold`
      // entirely. We only want that for the actively focused/selected
      // node and persistent user highlights — never for the global
      // "Mostra nomi nodi" / "Icone categorie" toggles, otherwise the
      // fade-threshold slider has no effect when those toggles are on.
      res.forceLabel = isUserHighlighted || isFocusOrSelected;
    }
    res.showIcon = showIcon;

    return res;
  });

  sigma.setSetting('edgeReducer', (edge, data) => {
    const ctx = getCtx();
    const { filters, hiddenKinds, matchedNodes, searchQuery, palette: pal, hoveredEdge, lodTier } = ctx;
    const res: Record<string, unknown> = { ...data };
    const sizeMult = filters.edgeSizeMultiplier;
    const defaultEdgeType = filters.arrows ? 'arrow' : 'line';
    // STRICT UNIFORMITY: every edge ships with the same stroke width
    // and the same colour saturation. Only the focus subgraph and the
    // hovered edge get a separate (still uniform) accent treatment.
    const baseSize = 1.35 * sizeMult;
    const baseColor = colorWithAlpha(pal.edge, 0.7);

    // Hide edges connecting hidden-kind / orphan-filtered endpoints.
    const [src, tgt] = graph.extremities(edge);
    const srcKind = String(graph.getNodeAttribute(src, 'kind') ?? 'custom');
    const tgtKind = String(graph.getNodeAttribute(tgt, 'kind') ?? 'custom');
    if (hiddenKinds.has(srcKind) || hiddenKinds.has(tgtKind)) {
      res.color = 'rgba(0,0,0,0)';
      res.size = 0;
      return res;
    }
    if (filters.hideOrphans && (graph.degree(src) === 0 || graph.degree(tgt) === 0)) {
      res.color = 'rgba(0,0,0,0)';
      res.size = 0;
      return res;
    }

    // Uniform Obsidian-style baseline.
    res.type = defaultEdgeType;
    res.color = baseColor;
    res.size = baseSize;

    const hasQuery = matchedNodes.size > 0 || searchQuery.trim().length > 0;
    if (hasQuery) {
      if (matchedNodes.has(src) && matchedNodes.has(tgt)) {
        res.color = colorWithAlpha(pal.edgeFocus, 0.85);
        res.zIndex = 1;
      } else {
        res.color = colorWithAlpha(pal.edge, 0.12);
      }
    }

    const focusId = activeFocusId(ctx);
    let isOutOfFocus = false;
    if (focusId) {
      const { edges } = highlightNeighbors(graph, focusId);
      if (edges.has(edge)) {
        // Focus subgraph — full saturation, always with arrows even
        // when the global toggle is off so the user can read direction
        // when they actively interrogate a node. Width stays uniform.
        res.type = 'arrow';
        res.color = pal.edgeFocus;
        res.zIndex = 2;
      } else {
        isOutOfFocus = true;
        // Out-of-focus edges share one uniform dim shade — same type,
        // width and opacity for every link, regardless of endpoints.
        res.color = mixOpaqueColor(pal.edge, pal.bg, 0.30);
        res.zIndex = 0;
      }
    }

    if (!isOutOfFocus && hoveredEdge && hoveredEdge === edge) {
      res.type = 'arrow';
      res.color = pal.edgeFocus;
    }

    // LOD gate — in `far` tier, hide background edges. While a node
    // focus is active, hover cannot make an out-of-focus edge escape
    // the focus contract.
    if (lodTier === 'far') {
      const focusId = activeFocusId(ctx);
      const inFocus = focusId !== null
        && highlightNeighbors(graph, focusId).edges.has(edge);
      const survives = inFocus || (focusId === null && hoveredEdge === edge);
      if (!survives) {
        res.color = 'rgba(0,0,0,0)';
        res.size = 0;
      }
    }

    return res;
  });
}
