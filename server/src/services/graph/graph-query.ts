/**
 * Graph query orchestrator — top-level executor for `POST /api/graph/query`.
 *
 * Pipeline:
 *
 *  1. Run the SQL portion of the filter against `notes` to get the
 *     candidate node set.
 *  2. Assemble the edge set:
 *       – Classic links from the `links` table when `includeLinks`.
 *       – Relation-property edges for the requested (or all) relation
 *         property defs.
 *     Edges referencing nodes outside the candidate set are dropped to
 *     keep the graph closed.
 *  3. Compute degree / inDegree / outDegree once over the union.
 *  4. Apply the planner's residual metric post-filters; nodes that fail
 *     the predicate are pruned, and edges with a pruned endpoint go too.
 *  5. Materialise property snapshots when `includeProperties` is non-empty.
 *  6. Build the response payload — `metrics` and `properties` fields are
 *     emitted only when the caller asked for them so legacy consumers
 *     that don't know about them keep seeing the original shape.
 *
 * The resulting `{nodes, edges}` shape is identical to what the legacy
 * `/api/links/graph` endpoint returns, just with optional extra fields,
 * so both endpoints can share this single code path.
 */
import { inArray, eq, and, or as drizzleOr } from 'drizzle-orm';
import type {
  FilterGroup,
  GraphEdge,
  GraphNode,
  GraphPropertySnapshot,
  GraphQueryRequest,
  GraphQueryResponse,
} from '@continuum/shared';
import { isFilterGroup } from '@continuum/shared';
import { db } from '../../db/client.js';
import { links, propertyDefinitions } from '../../db/schema.js';
import { executeNoteQuery } from '../query/note-query.js';
import { materializeProperties } from '../query/property-materializer.js';
import {
  applyMetricPostFilters,
  computeGraphMetrics,
  type MetricEdgeRef,
} from './graph-projections.js';
import {
  buildRelationEdges,
  listAllRelationPropertyKeys,
} from './relation-edge-source.js';

/**
 * Execute a graph-query request and return the assembled `{nodes, edges}`
 * payload. Pure orchestration; the heavy lifting lives in the helpers
 * this function calls.
 */
export async function executeGraphQuery(
  req: GraphQueryRequest,
): Promise<GraphQueryResponse> {
  const now = new Date();

  // 1. SQL pass — candidate notes.
  const { rows: noteRows, postFilters } = await executeNoteQuery(req.filter, now);
  if (noteRows.length === 0) return { nodes: [], edges: [] };

  const candidateIds = noteRows.map((n) => n.id);

  // 2. Edge sources.
  const edges: GraphEdge[] = [];

  if (req.edgeSources.includeLinks) {
    const linkRows = await db
      .select()
      .from(links)
      .where(
        and(
          inArray(links.sourceId, candidateIds),
          inArray(links.targetId, candidateIds),
        ),
      );
    for (const row of linkRows) {
      if (row.sourceId === row.targetId) continue;
      edges.push({
        id: row.id,
        source: row.sourceId,
        target: row.targetId,
        type: row.type,
        sourceKind: 'link',
      });
    }
  }

  const relationKeys = await resolveRelationPropertyKeys(req);
  if (relationKeys.length > 0) {
    const relEdges = await buildRelationEdges(relationKeys, candidateIds);
    for (const e of relEdges) edges.push(e);
  }

  // 3. Metrics over the union edge set.
  const metricEdges: MetricEdgeRef[] = edges.map((e) => ({ source: e.source, target: e.target }));
  const metrics = computeGraphMetrics(candidateIds, metricEdges);

  // 4. Apply residual metric post-filters.
  const rootCombinator = isFilterGroup(req.filter)
    ? (req.filter as FilterGroup).combinator
    : 'and';
  const passes = applyMetricPostFilters(metrics, postFilters, rootCombinator);
  const finalNodeIds = candidateIds.filter(passes);
  const finalNodeSet = new Set(finalNodeIds);

  // 5. Materialise properties (optional).
  const propertySnapshots: Map<string, GraphPropertySnapshot[]> =
    req.includeProperties.length === 0
      ? new Map()
      : await materializeProperties(finalNodeIds, req.includeProperties);

  // 6. Build response payload.
  const noteRowById = new Map(noteRows.map((n) => [n.id, n] as const));
  const nodes: GraphNode[] = finalNodeIds.map((id) => {
    const note = noteRowById.get(id);
    // Defensive — finalNodeIds is derived from noteRows so this is always set.
    if (!note) {
      return { id, label: id, kind: 'note' };
    }
    const node: GraphNode = {
      id: note.id,
      label: note.title,
      kind: note.kind,
      folderId: note.folderId,
      tags: note.tags,
      locked: note.locked,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
    if (req.includeProperties.length > 0) {
      node.properties = propertySnapshots.get(id) ?? [];
    }
    if (req.includeMetrics) {
      node.metrics = metrics.get(id) ?? { degree: 0, inDegree: 0, outDegree: 0 };
    }
    return node;
  });

  const finalEdges = edges.filter(
    (e) => finalNodeSet.has(e.source) && finalNodeSet.has(e.target),
  );

  return { nodes, edges: finalEdges };
}

/**
 * Resolve which relation-property keys feed the edge set. When the
 * request asks for "all", we list every distinct relation-property key
 * once; otherwise the explicit allow-list is filtered down to keys that
 * actually correspond to a relation-typed definition (so a stale saved
 * view doesn't silently include arbitrary keys).
 */
async function resolveRelationPropertyKeys(req: GraphQueryRequest): Promise<string[]> {
  const sources = req.edgeSources;
  if (sources.allRelationProperties) {
    return listAllRelationPropertyKeys();
  }
  if (sources.relationPropertyKeys.length === 0) return [];
  // Restrict the explicit list to actual relation defs.
  const rows = await db
    .select({ key: propertyDefinitions.key })
    .from(propertyDefinitions)
    .where(
      and(
        inArray(propertyDefinitions.key, sources.relationPropertyKeys),
        eq(propertyDefinitions.type, 'relation'),
      ),
    )
    .groupBy(propertyDefinitions.key);
  return rows.map((r) => r.key);
}

// Reference to keep `drizzleOr` available for future composite predicates
// without a re-import; tree-shaken away by the bundler.
void drizzleOr;
