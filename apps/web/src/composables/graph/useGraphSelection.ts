/**
 * Selection / hover state for the Knowledge Graph view.
 *
 * Owns the currently-selected node (drives the bottom-left card and
 * the Sigma reducer focus subgraph) plus the hovered node and edge
 * ids. The `userHighlight` per-node attribute itself lives on the
 * Graphology graph; this composable mirrors the *selection* of one
 * such id and the highlightedIds set is owned by `useGraphPreferences`.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type { Graph } from '@continuum/graph';
import { graphDisplayLabel } from '@/utils/graphLabels';

/**
 * Bottom-left selected-card metadata. Structurally identical to the
 * `SelectedInfo` emitted by `Graph3DCanvas.vue` so that the 2D ↔ 3D
 * bridge requires no adapter at the call sites.
 */
export interface SelectedInfo {
  id: string;
  label: string;
  kind: string;
  inDegree: number;
  outDegree: number;
  wikilinkCount: number;
  relatedCount: number;
}

export interface UseGraphSelectionReturn {
  selected: Ref<SelectedInfo | null>;
  hoveredNode: Ref<string | null>;
  hoveredEdge: Ref<string | null>;
  /** True when the currently-selected node is in `highlightedIds`. */
  selectedHighlighted: ComputedRef<boolean>;
  /** Build a `SelectedInfo` for `id` from the live graph. */
  buildSelected(graph: Graph, id: string): SelectedInfo;
  /** Hover trumps selection for reducer focus subgraph. */
  activeFocusId(): string | null;
  clearSelection(): void;
}

export function useGraphSelection(opts: {
  highlightedIds: Ref<Set<string>>;
}): UseGraphSelectionReturn {
  const selected = ref<SelectedInfo | null>(null);
  const hoveredNode = ref<string | null>(null);
  const hoveredEdge = ref<string | null>(null);

  const selectedHighlighted = computed<boolean>(() => {
    const sel = selected.value;
    if (!sel) return false;
    return opts.highlightedIds.value.has(sel.id);
  });

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
      label: graphDisplayLabel(attrs.label ?? '(untitled)', 48),
      kind: attrs.kind ?? 'custom',
      inDegree: graph.inDegree(id),
      outDegree: graph.outDegree(id),
      wikilinkCount,
      relatedCount,
    };
  }

  function activeFocusId(): string | null {
    return hoveredNode.value ?? selected.value?.id ?? null;
  }

  function clearSelection(): void {
    selected.value = null;
  }

  return {
    selected,
    hoveredNode,
    hoveredEdge,
    selectedHighlighted,
    buildSelected,
    activeFocusId,
    clearSelection,
  };
}
