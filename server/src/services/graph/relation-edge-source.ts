/**
 * Relation-property edge source.
 *
 * Custom properties of type `relation` form a parallel edge layer in the
 * graph — semantically equivalent to the classic `links` table but driven
 * by user-defined property schemas. This module turns the stored target
 * id arrays into the same `GraphEdge` shape the rest of the graph uses,
 * so the client can render and filter both sources uniformly.
 *
 * Edges are produced with:
 *  – `sourceKind: 'relationProperty'` so the UI can style them differently,
 *  – `propertyId` carrying the originating definition for filtering,
 *  – a deterministic `id` (`rel:<propId>:<src>:<tgt>`) so re-runs of the
 *    same query yield stable Vue keys without a roundtrip to the DB.
 *
 * Self-edges and edges that point outside the filtered universe of nodes
 * are dropped — keeping the graph closed makes the metric calculations
 * downstream actually correspond to what the user sees.
 */
import { inArray, and } from 'drizzle-orm';
import type { GraphEdge } from '@continuum/shared';
import { db } from '../../db/client.js';
import { propertyDefinitions, propertyValues } from '../../db/schema.js';

/**
 * Build the relation-property edge set restricted to the given nodes.
 *
 * @param relationPropertyIds  Property definition ids of type `relation`.
 *                             Anything else is silently ignored so the
 *                             caller can pass an unfiltered allow-list.
 * @param nodeIds              The closed universe of node ids the graph
 *                             query already settled on. Both endpoints of
 *                             each emitted edge are guaranteed to be in
 *                             this set.
 */
export async function buildRelationEdges(
  relationPropertyIds: string[],
  nodeIds: string[],
): Promise<GraphEdge[]> {
  if (relationPropertyIds.length === 0 || nodeIds.length === 0) return [];

  // Verify the supplied ids actually point at relation properties — caller
  // may have been given a stale list. Cheap to do, prevents surprises.
  const defs = await db
    .select()
    .from(propertyDefinitions)
    .where(inArray(propertyDefinitions.id, relationPropertyIds));
  const validDefs = defs.filter((d) => d.type === 'relation');
  if (validDefs.length === 0) return [];
  const validIds = validDefs.map((d) => d.id);
  const defKeyById = new Map(validDefs.map((d) => [d.id, d.key] as const));

  const rows = await db
    .select()
    .from(propertyValues)
    .where(
      and(
        inArray(propertyValues.propertyId, validIds),
        inArray(propertyValues.noteId, nodeIds),
      ),
    );

  const nodeIdSet = new Set(nodeIds);
  const edges: GraphEdge[] = [];
  for (const row of rows) {
    const targets = row.valueJson;
    if (!Array.isArray(targets)) continue;
    for (const raw of targets) {
      if (typeof raw !== 'string') continue;
      if (raw === row.noteId) continue;
      if (!nodeIdSet.has(raw)) continue;
      edges.push({
        id: `rel:${row.propertyId}:${row.noteId}:${raw}`,
        source: row.noteId,
        target: raw,
        type: defKeyById.get(row.propertyId) ?? 'relation',
        sourceKind: 'relationProperty',
        propertyId: row.propertyId,
      });
    }
  }
  return edges;
}

/** Fetch every relation-property definition id in one query. */
export async function listAllRelationPropertyIds(): Promise<string[]> {
  const rows = await db
    .select({ id: propertyDefinitions.id, type: propertyDefinitions.type })
    .from(propertyDefinitions);
  return rows.filter((r) => r.type === 'relation').map((r) => r.id);
}
