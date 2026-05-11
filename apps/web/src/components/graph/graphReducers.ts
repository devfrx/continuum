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
  nodeSizeMultiplier: number;
  edgeSizeMultiplier: number;
  /** When true, suppress the muted 1px node border ring. */
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
    const res: Record<string, unknown> = { ...data };
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
    // Solid fill — no alpha bleed.
    res.color = baseColor;
    res.size = baseSize * filters.nodeSizeMultiplier;
    res.label = '';
    // Solid-nodes default — hide the muted 1px outline ring; per-node
    // overrides below (selection / highlight) still set borderColor.
    if (filters.solidNodes) {
      (res as { borderColor?: string }).borderColor = 'rgba(0,0,0,0)';
    }

    // 1. Hidden kind → near-invisible micro dot, no label, no icon.
    if (hiddenKinds.has(kind)) {
      res.color = pal.nodeHidden;
      res.size = baseSize * 0.35 * filters.nodeSizeMultiplier;
      res.label = '';
      res.zIndex = 0;
      (res as { dimmed?: boolean }).dimmed = true;
      return res;
    }

    // 1b. Orphan filter — hide isolated nodes when active.
    if (filters.hideOrphans && graph.degree(node) === 0) {
      res.color = 'rgba(0,0,0,0)';
      res.size = 0;
      res.label = '';
      res.zIndex = -1;
      (res as { dimmed?: boolean }).dimmed = true;
      return res;
    }

    // 2. Search filter — keep non-matches visible but desaturated.
    const hasQuery = matchedNodes.size > 0 || searchQuery.trim().length > 0;
    if (hasQuery && !matchedNodes.has(node)) {
      res.color = pal.nodeDim;
      (res as { dimmed?: boolean }).dimmed = true;
    } else if (hasQuery && matchedNodes.has(node)) {
      res.color = baseColor;
      res.size = Math.max(Number(res.size ?? baseSize), baseSize * 1.12 * filters.nodeSizeMultiplier);
      res.zIndex = 2;
      showLabel = true;
    }

    // 3. Selection / hover focus — vivid focus subgraph, dim background.
    const focusId = activeFocusId(ctx);
    const isUserHighlighted = Boolean((data as { userHighlight?: boolean }).userHighlight);
    if (!focusId && !hasQuery && isProminent) {
      res.size = Math.max(Number(res.size ?? baseSize), baseSize * 1.08 * filters.nodeSizeMultiplier);
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 1);
      showLabel = true;
    }
    if (focusId) {
      const { nodes } = highlightNeighbors(graph, focusId);
      const inSet = nodes.has(node);
      if (!inSet) {
        if (!isUserHighlighted) {
          res.color = pal.nodeDim;
          res.label = '';
          (res as { dimmed?: boolean }).dimmed = true;
        }
      } else if (node === focusId) {
        res.color = baseColor;
        res.size = baseSize * 1.26 * filters.nodeSizeMultiplier;
        res.zIndex = 3;
        showLabel = true;
      } else {
        res.color = baseColor;
        res.size = baseSize * 1.08 * filters.nodeSizeMultiplier;
        res.zIndex = 2;
        showLabel = true;
      }
    }

    if (ctx.selectedId === node) {
      res.color = baseColor;
      res.size = Math.max(Number(res.size ?? baseSize), baseSize * 1.18 * filters.nodeSizeMultiplier);
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 2);
      (res as { borderColor?: string }).borderColor = pal.edgeFocus;
      showLabel = true;
    }

    // 4. Persistent user highlight — accent border + bumped size.
    if (isUserHighlighted) {
      res.color = baseColor;
      res.size = Math.max(Number(res.size ?? baseSize), baseSize * 1.28 * filters.nodeSizeMultiplier);
      res.zIndex = Math.max(Number(res.zIndex ?? 0), 3);
      (res as { borderColor?: string }).borderColor = pal.accent;
      showLabel = true;
    }

    if (showLabel) {
      // LOD gate — in `mid` / `far` tiers, suppress all labels except
      // the actively hovered or selected node. Search matches in `mid`
      // remain (user is hunting); in `far` only focus/selection survive.
      const allowLabel = lodTier === 'near'
        || isFocusOrSelected
        || (lodTier === 'mid' && (matchedNodes.has(node) || prominentNodeIds.has(node)));
      if (allowLabel) res.label = graphDisplayLabel(rawLabel, 32);
    }

    return res;
  });

  sigma.setSetting('edgeReducer', (edge, data) => {
    const ctx = getCtx();
    const { filters, hiddenKinds, matchedNodes, searchQuery, prominentEdgeIds, palette: pal, hoveredEdge, lodTier } = ctx;
    const res: Record<string, unknown> = { ...data };
    const baseSize = Number((data as { baseSize?: number }).baseSize ?? data.size ?? 1);
    const linkType = String((data as { linkType?: unknown }).linkType ?? 'related');
    const isWikilink = linkType === 'wikilink';
    const sizeMult = filters.edgeSizeMultiplier;
    const defaultEdgeType = filters.arrows ? 'arrow' : 'line';

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
    res.color = colorWithAlpha(pal.edge, isWikilink ? 0.78 : 0.62);
    res.size = Math.max(isWikilink ? 0.9 : 0.75, baseSize * (isWikilink ? 1.0 : 0.85)) * sizeMult;

    const hasQuery = matchedNodes.size > 0 || searchQuery.trim().length > 0;
    if (hasQuery) {
      if (matchedNodes.has(src) && matchedNodes.has(tgt)) {
        res.color = colorWithAlpha(pal.edgeFocus, 0.85);
        res.size = Math.max(0.4, baseSize * 1.35) * sizeMult;
        res.zIndex = 1;
      } else {
        res.color = colorWithAlpha(pal.edge, 0.12);
        res.size = Math.max(0.18, baseSize * 0.45) * sizeMult;
      }
    } else if (prominentEdgeIds.has(edge)) {
      res.color = colorWithAlpha(pal.edge, isWikilink ? 0.95 : 0.82);
      res.size = Math.max(isWikilink ? 0.6 : 0.5, baseSize * (isWikilink ? 1.2 : 1.0)) * sizeMult;
    }

    const focusId = activeFocusId(ctx);
    if (focusId) {
      const { edges } = highlightNeighbors(graph, focusId);
      if (edges.has(edge)) {
        // Focus subgraph — full saturation + extra weight, always with arrows
        // even when the global toggle is off so the user can read direction
        // when they actively interrogate a node.
        res.type = 'arrow';
        res.color = pal.edgeFocus;
        res.size = Math.max(0.6, baseSize * 1.45) * sizeMult;
        res.zIndex = 2;
      } else {
        res.color = colorWithAlpha(pal.edge, 0.08);
        res.size = Math.max(0.2, baseSize * 0.55) * sizeMult;
      }
    }

    if (hoveredEdge && hoveredEdge === edge) {
      res.type = 'arrow';
      res.color = pal.edgeFocus;
      res.size = Math.max(0.7, baseSize * 1.65) * sizeMult;
    }

    // LOD gate — in `far` tier, hide background edges (only the focus
    // subgraph + the actively hovered edge survive).
    if (lodTier === 'far') {
      const focusId = activeFocusId(ctx);
      const inFocus = focusId !== null
        && highlightNeighbors(graph, focusId).edges.has(edge);
      const survives = inFocus || hoveredEdge === edge;
      if (!survives) {
        res.color = 'rgba(0,0,0,0)';
        res.size = 0;
      }
    }

    return res;
  });
}
