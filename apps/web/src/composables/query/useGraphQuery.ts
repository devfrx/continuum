/**
 * Graph query orchestrator.
 *
 * Joins the three independent inputs that make up a `GraphQueryRequest` —
 *   – the filter tree (via `useFilterBuilder`),
 *   – the edge-source selection,
 *   – the property/metric encodings (passed in by the caller),
 * — into a single `buildRequest()` / `fetch()` surface that the graph view
 * consumes.
 *
 * Persistence:
 *   – the filter tree is mirrored into `STORAGE_KEYS.graphDataQuery` by
 *     `useFilterBuilder`'s built-in storage hook,
 *   – the edge-source selection is mirrored into
 *     `STORAGE_KEYS.graphEdgeSources` here so the two slots can evolve
 *     independently (the user typically edits the filter much more often
 *     than the edge-source allowlist).
 */
import { ref, shallowRef, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue';
import {
  DEFAULT_EDGE_SOURCE_SELECTION,
  type GraphEdgeSourceSelection,
  type GraphQueryRequest,
  type GraphQueryResponse,
} from '@continuum/shared';
import { api } from '@/api';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import {
  useFilterBuilder,
  type UseFilterBuilderReturn,
} from './useFilterBuilder';
import type { GraphEncodings } from './useGraphPropertyEncodings';

const FILTER_KEY = STORAGE_KEYS.graphDataQuery;
const EDGE_SOURCES_KEY = STORAGE_KEYS.graphEdgeSources;

export interface UseGraphQueryOptions {
  encodings: Ref<GraphEncodings>;
  requiredPropertyIds: ComputedRef<string[]>;
  requiresMetrics: ComputedRef<boolean>;
}

export interface UseGraphQueryReturn {
  filter: UseFilterBuilderReturn;
  edgeSources: Ref<GraphEdgeSourceSelection>;
  /** Last response (raw payload). */
  payload: ShallowRef<GraphQueryResponse | null>;
  loading: Ref<boolean>;
  /** Build the GraphQueryRequest from current state without firing. */
  buildRequest: () => GraphQueryRequest;
  /** Run the query and update `payload`. Returns the response. */
  fetch: () => Promise<GraphQueryResponse>;
  resetEdgeSources: () => void;
}

/** Defensive parse: only accept the exact `GraphEdgeSourceSelection` shape. */
export function coerceGraphEdgeSources(value: unknown): GraphEdgeSourceSelection | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<GraphEdgeSourceSelection>;
  if (typeof v.includeLinks !== 'boolean') return null;
  if (typeof v.allRelationProperties !== 'boolean') return null;
  if (!Array.isArray(v.relationPropertyIds)) return null;
  if (!v.relationPropertyIds.every((id) => typeof id === 'string')) return null;
  return {
    includeLinks: v.includeLinks,
    allRelationProperties: v.allRelationProperties,
    relationPropertyIds: v.relationPropertyIds.slice(),
  };
}

function readStoredEdgeSources(): GraphEdgeSourceSelection {
  try {
    const raw = localStorage.getItem(EDGE_SOURCES_KEY);
    if (!raw) return { ...DEFAULT_EDGE_SOURCE_SELECTION, relationPropertyIds: [] };
    return (
      coerceGraphEdgeSources(JSON.parse(raw)) ?? {
        ...DEFAULT_EDGE_SOURCE_SELECTION,
        relationPropertyIds: [],
      }
    );
  } catch {
    return { ...DEFAULT_EDGE_SOURCE_SELECTION, relationPropertyIds: [] };
  }
}

function persistEdgeSources(value: GraphEdgeSourceSelection): void {
  try {
    localStorage.setItem(EDGE_SOURCES_KEY, JSON.stringify(value));
  } catch {
    // Restrictive WebViews — keep editing in-memory only.
  }
}

export function useGraphQuery(options: UseGraphQueryOptions): UseGraphQueryReturn {
  const filter = useFilterBuilder({ storageKey: FILTER_KEY });
  const edgeSources = ref<GraphEdgeSourceSelection>(readStoredEdgeSources());
  const payload = shallowRef<GraphQueryResponse | null>(null);
  const loading = ref<boolean>(false);

  watch(edgeSources, (next) => persistEdgeSources(next), { deep: true });

  function buildRequest(): GraphQueryRequest {
    return {
      filter: filter.root.value,
      edgeSources: edgeSources.value,
      includeProperties: options.requiredPropertyIds.value.slice(),
      includeMetrics: options.requiresMetrics.value,
    };
  }

  async function fetch(): Promise<GraphQueryResponse> {
    loading.value = true;
    try {
      const response = await api.graph.query(buildRequest());
      payload.value = response;
      return response;
    } finally {
      loading.value = false;
    }
  }

  function resetEdgeSources(): void {
    edgeSources.value = { ...DEFAULT_EDGE_SOURCE_SELECTION, relationPropertyIds: [] };
  }

  return { filter, edgeSources, payload, loading, buildRequest, fetch, resetEdgeSources };
}
