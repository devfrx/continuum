/**
 * Persistent Filtri-panel state (sliders, toggles, forces) plus
 * search query. Mirrors Obsidian's "Filtri" panel one-to-one for
 * the controls that translate to a database-backed graph; defaults
 * match the d3-force baseline so a full reset returns every slider
 * exactly to its canonical value.
 *
 * Persisted under `STORAGE_KEYS.graphFilters`. The search query
 * lives here too because it shares Reset semantics with the legend
 * filters (`clearGraphFilters` → clearSearch + showAllKinds).
 */
import { reactive, ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import type { Graph } from '@continuum/graph';
import { STORAGE_KEYS } from '@/lib/storageKeys';

/**
 * @see GraphView usage notes — every slider maps to either the live
 * d3-force simulation or the Sigma reducers.
 */
export interface GraphFilters {
  /** Hide nodes whose `degree === 0` (no incoming AND no outgoing edges). */
  hideOrphans: boolean;
  /** Render every node in the neutral "default shade" — disables kind colours. */
  monochrome: boolean;
  /** Aspetto → Frecce. When false, edges render as plain lines with no arrows. */
  arrows: boolean;
  /** Aspetto → Soglia dissolvenza testo. 0 = labels always hidden, 1 = always shown. */
  labelFadeThreshold: number;
  /** Aspetto → Nomi nodi. When true, node names render persistently. */
  showNodeLabels: boolean;
  /** Aspetto → Icone categorie. When true, category icons render persistently. */
  showNodeIcons: boolean;
  /** Aspetto → Dimensione nodo. Multiplier applied to every node's `baseSize`. */
  nodeSizeMultiplier: number;
  /** Aspetto → Spessore linea. Multiplier applied to every edge's `baseSize`. */
  edgeSizeMultiplier: number;
  /** Forze → Forza di centratura → maps to d3 `gravity`. */
  centerForce: number;
  /** Forze → Forza di repulsione → maps to d3 `manyBody.strength` (negative). */
  repelForce: number;
  /** Forze → Forza collegamenti → maps to d3 `link.strength` override. */
  linkForce: number;
  /** Forze → Distanza collegamenti → maps to d3 `link.distance` resting length. */
  linkDistance: number;
  /**
   * Aspetto → Nodi solidi. When true (default), nodes render as solid
   * filled discs (2D) / spheres (3D) without the muted 1px outline
   * ring. Disabling brings back the bordered look used pre-Wave-3e.
   */
  solidNodes: boolean;
  /**
   * Aspetto → LOD adattivo. When true (default), the renderer hides
   * non-essential details (labels, background edges, prominent halos)
   * once the graph or zoom-out crosses the LOD thresholds defined in
   * `lodConfig.ts`. Disable to force `near` tier permanently.
   */
  lodEnabled: boolean;
}

export const GRAPH_FILTERS_DEFAULTS: GraphFilters = {
  hideOrphans: false,
  monochrome: false,
  arrows: true,
  labelFadeThreshold: 0.55,
  showNodeLabels: false,
  showNodeIcons: false,
  nodeSizeMultiplier: 1,
  edgeSizeMultiplier: 1,
  centerForce: 0.08,
  repelForce: -380,
  linkForce: 0.5,
  linkDistance: 140,
  solidNodes: true,
  lodEnabled: true,
};

const FILTERS_KEY = STORAGE_KEYS.graphFilters;

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function coerceGraphFilters(value: unknown): GraphFilters {
  const parsed = value && typeof value === 'object'
    ? value as Partial<Record<keyof GraphFilters, unknown>>
    : {};
  return {
    hideOrphans: typeof parsed.hideOrphans === 'boolean' ? parsed.hideOrphans : GRAPH_FILTERS_DEFAULTS.hideOrphans,
    monochrome: typeof parsed.monochrome === 'boolean' ? parsed.monochrome : GRAPH_FILTERS_DEFAULTS.monochrome,
    arrows: typeof parsed.arrows === 'boolean' ? parsed.arrows : GRAPH_FILTERS_DEFAULTS.arrows,
    labelFadeThreshold: clamp(parsed.labelFadeThreshold, 0, 1, GRAPH_FILTERS_DEFAULTS.labelFadeThreshold),
    showNodeLabels: typeof parsed.showNodeLabels === 'boolean'
      ? parsed.showNodeLabels
      : GRAPH_FILTERS_DEFAULTS.showNodeLabels,
    showNodeIcons: typeof parsed.showNodeIcons === 'boolean'
      ? parsed.showNodeIcons
      : GRAPH_FILTERS_DEFAULTS.showNodeIcons,
    nodeSizeMultiplier: clamp(parsed.nodeSizeMultiplier, 0.3, 3, GRAPH_FILTERS_DEFAULTS.nodeSizeMultiplier),
    edgeSizeMultiplier: clamp(parsed.edgeSizeMultiplier, 0.3, 4, GRAPH_FILTERS_DEFAULTS.edgeSizeMultiplier),
    centerForce: clamp(parsed.centerForce, 0, 0.5, GRAPH_FILTERS_DEFAULTS.centerForce),
    repelForce: clamp(parsed.repelForce, -2000, -10, GRAPH_FILTERS_DEFAULTS.repelForce),
    linkForce: clamp(parsed.linkForce, 0, 2, GRAPH_FILTERS_DEFAULTS.linkForce),
    linkDistance: clamp(parsed.linkDistance, 30, 500, GRAPH_FILTERS_DEFAULTS.linkDistance),
    solidNodes: typeof parsed.solidNodes === 'boolean' ? parsed.solidNodes : GRAPH_FILTERS_DEFAULTS.solidNodes,
    lodEnabled: typeof parsed.lodEnabled === 'boolean' ? parsed.lodEnabled : GRAPH_FILTERS_DEFAULTS.lodEnabled,
  };
}

function readStoredFilters(): GraphFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return { ...GRAPH_FILTERS_DEFAULTS };
    return coerceGraphFilters(JSON.parse(raw));
  } catch {
    return { ...GRAPH_FILTERS_DEFAULTS };
  }
}

export interface UseGraphFiltersReturn {
  filters: GraphFilters;
  searchQuery: Ref<string>;
  matchedNodes: ShallowRef<Set<string>>;
  /** Recompute label-substring matches against the current graph. */
  recomputeMatches(graph: Graph | null): void;
  /** Persist the current filters payload immediately. */
  saveFilters(): void;
  /** Restore every slider/toggle to `GRAPH_FILTERS_DEFAULTS`. */
  resetFiltersToDefaults(): void;
  /** Clear the search query (matches recompute on the watcher). */
  clearSearch(): void;
  /**
   * Pick the best label match for the current query, skipping nodes
   * whose kind is hidden. Returns `null` if no match exists.
   */
  findSearchTargetId(graph: Graph | null, hiddenKinds: Set<string>): string | null;
}

export function useGraphFilters(): UseGraphFiltersReturn {
  const filters = reactive<GraphFilters>(readStoredFilters());
  const searchQuery = ref<string>('');
  const matchedNodes = shallowRef<Set<string>>(new Set<string>());

  function recomputeMatches(graph: Graph | null): void {
    const q = searchQuery.value.trim().toLowerCase();
    if (!graph || !q) {
      matchedNodes.value = new Set<string>();
      return;
    }
    const matches = new Set<string>();
    graph.forEachNode((id, attrs) => {
      const label = String((attrs as { label?: string }).label ?? '').toLowerCase();
      if (label.includes(q)) matches.add(id);
    });
    matchedNodes.value = matches;
  }

  function saveFilters(): void {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...filters }));
    } catch {
      // Restrictive WebViews — graph still works in memory.
    }
  }

  function resetFiltersToDefaults(): void {
    Object.assign(filters, GRAPH_FILTERS_DEFAULTS);
  }

  function clearSearch(): void {
    searchQuery.value = '';
  }

  function searchScore(label: string, query: string): number | null {
    const normalized = label.toLowerCase();
    if (normalized === query) return 0;
    if (normalized.startsWith(query)) return 1;
    const index = normalized.indexOf(query);
    return index >= 0 ? 2 + index / 1000 : null;
  }

  function findSearchTargetId(graph: Graph | null, hiddenKinds: Set<string>): string | null {
    const query = searchQuery.value.trim().toLowerCase();
    if (!graph || !query) return null;
    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestLabel = '';
    graph.forEachNode((id, attrs) => {
      const kind = String((attrs as { kind?: unknown }).kind ?? 'custom');
      if (hiddenKinds.has(kind)) return;
      const label = String((attrs as { label?: unknown }).label ?? '');
      const score = searchScore(label, query);
      if (score === null) return;
      if (score < bestScore || (score === bestScore && label.localeCompare(bestLabel) < 0)) {
        bestId = id;
        bestScore = score;
        bestLabel = label;
      }
    });
    return bestId;
  }

  return {
    filters,
    searchQuery,
    matchedNodes,
    recomputeMatches,
    saveFilters,
    resetFiltersToDefaults,
    clearSearch,
    findSearchTargetId,
  };
}
