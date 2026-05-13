// ===== Query — Graph endpoint contract =====
//
// Wire shape for `POST /api/graph/query`. The endpoint takes a filter tree
// plus a few projection knobs and returns a graph payload (`GraphNode[]` +
// `GraphEdge[]`) enriched with the property snapshots and metrics the
// caller asked for.
//
// Keeping the request shape tiny and explicit (no implicit defaults beyond
// the exported constants) means the server can validate it with a strict
// schema and the client can serialise saved views without losing intent.

import type { GraphEdge, GraphNode, UUID } from '../index.js';
import type { PropertyType, PropertyValue } from '../properties.js';
import type { FieldDescriptor } from './fields.js';
import type { FilterNode } from './filters.js';
import { EMPTY_FILTER_GROUP } from './filters.js';

/**
 * Numeric metrics computed for a node at query time. Always all three are
 * returned together — they share the same scan over the edge set so there
 * is no value in making them individually opt-in.
 */
export interface GraphNodeMetrics {
  /** Total number of incident edges (in + out, undirected count). */
  degree: number;
  /** Edges arriving at this node. */
  inDegree: number;
  /** Edges leaving this node. */
  outDegree: number;
}

/**
 * Materialised property snapshot attached to a graph node when the caller
 * requests it via `GraphQueryRequest.includeProperties`. The shape is
 * deliberately self-describing (carries `key` and `type`) so the client can
 * render a value without a second lookup against the property definitions.
 */
export interface GraphPropertySnapshot {
  /** Property definition id this value is for. */
  propertyId: UUID;
  /** Convenience copy of the definition's `key` for client-side lookups. */
  key: string;
  /** Property type — drives client-side rendering. */
  type: PropertyType;
  /** Resolved value; `null` when the note has no value for this property. */
  value: PropertyValue | null;
}

/**
 * Where an edge in the response came from. Lets the UI style edges
 * differently (e.g. dashed for property-driven relations) and lets the
 * client filter them out without re-querying.
 */
export type GraphEdgeSourceKind = 'link' | 'relationProperty';

/**
 * Knobs controlling which edge sources participate in the response.
 *
 * `allRelationProperties` is a fast path for "give me everything"; when
 * `false`, only edges originating from the property ids in
 * `relationPropertyIds` are emitted. The two flags are independent so a
 * caller can request, say, "no classic links, only the `dependsOn`
 * relation" with a single request.
 */
export interface GraphEdgeSourceSelection {
  /** Include classic edges from the `links` table. */
  includeLinks: boolean;
  /**
   * When `true`, every relation-property edge is included. When `false`,
   * only edges originating from `relationPropertyIds` are included.
   */
  allRelationProperties: boolean;
  /** Allow-list applied when `allRelationProperties` is `false`. */
  relationPropertyIds: UUID[];
}

/**
 * Sensible default — show the full graph (all classic links plus every
 * relation property). Callers narrow it for focused views (e.g. a single
 * relation drill-down).
 */
export const DEFAULT_EDGE_SOURCE_SELECTION: GraphEdgeSourceSelection = {
  includeLinks: true,
  allRelationProperties: true,
  relationPropertyIds: [],
};

/**
 * Request body for `POST /api/graph/query`. Every field is required so the
 * server's schema validation can reject ambiguous payloads early — callers
 * use `EMPTY_GRAPH_QUERY_REQUEST` as a starting point and patch from there.
 */
export interface GraphQueryRequest {
  /** Filter tree applied to candidate nodes. */
  filter: FilterNode;
  /** Which edge sources to include in the response. */
  edgeSources: GraphEdgeSourceSelection;
  /** Property definition ids whose values must be materialised on each node. */
  includeProperties: UUID[];
  /** When `true`, every node carries `metrics`. */
  includeMetrics: boolean;
}

/**
 * Canonical empty request — matches everything, returns the full graph,
 * no extra projection. Use it as the seed when building a new view, then
 * patch the fields that differ.
 */
export const EMPTY_GRAPH_QUERY_REQUEST: GraphQueryRequest = {
  filter: EMPTY_FILTER_GROUP,
  edgeSources: DEFAULT_EDGE_SOURCE_SELECTION,
  includeProperties: [],
  includeMetrics: false,
};

/**
 * Response body for `GET /api/query/fields?surface=graph`. A flat list is
 * intentional — the UI groups by `FieldDescriptor.group` itself so the
 * server doesn't have to encode UI structure in the wire format.
 */
export interface FieldCatalog {
  fields: FieldDescriptor[];
}

/**
 * Response body for `POST /api/graph/query`. A plain `{nodes, edges}` payload
 * — enriched with `properties` / `metrics` per node when the corresponding
 * request flags asked for them. Kept structurally compatible with the legacy
 * `GET /api/links/graph` payload so renderers that only read the legacy
 * fields keep working unchanged.
 */
export interface GraphQueryResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
