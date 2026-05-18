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
 *  – `propertyKey` carrying the originating property's canonical key for
 *    filtering and grouping (per-note properties may live behind several
 *    backing definition rows; the key collapses them back into a single
 *    logical relation in the UI),
 *  – a deterministic `id` (`rel:<key>:<src>:<tgt>`) so re-runs of the
 *    same query yield stable Vue keys without a roundtrip to the DB and
 *    so two notes that share the same per-note relation key don't emit
 *    duplicate edges.
 *
 * Self-edges and edges that point outside the filtered universe of nodes
 * are dropped — keeping the graph closed makes the metric calculations
 * downstream actually correspond to what the user sees.
 */
import { inArray, and, eq, sql } from 'drizzle-orm';
import type { GraphEdge } from '@continuum/shared';
import { db } from '../../db/client.js';
import { propertyDefinitions, propertyValues } from '../../db/schema.js';

/**
 * Build the relation-property edge set restricted to the given nodes.
 *
 * @param relationPropertyKeys  Property keys whose definitions are of
 *                              type `relation`. Each key may resolve to
 *                              several backing definition rows (per-note
 *                              properties), all of which contribute to
 *                              the edge set; the resulting edges are
 *                              deduplicated by `(source, target, key)`
 *                              so the user sees one edge per logical
 *                              relation.
 * @param nodeIds               The closed universe of node ids the graph
 *                              query already settled on. Both endpoints
 *                              of each emitted edge are guaranteed to be
 *                              in this set.
 */
export async function buildRelationEdges(
  relationPropertyKeys: string[],
  nodeIds: string[],
): Promise<GraphEdge[]> {
  if (relationPropertyKeys.length === 0 || nodeIds.length === 0) return [];

  // Resolve keys to the actual relation-typed definition rows.
  const defs = await db
    .select()
    .from(propertyDefinitions)
    .where(
      and(
        inArray(propertyDefinitions.key, relationPropertyKeys),
        eq(propertyDefinitions.type, 'relation'),
      ),
    );
  if (defs.length === 0) return [];
  const validIds = defs.map((d) => d.id);
  const keyByDefId = new Map(defs.map((d) => [d.id, d.key] as const));

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
  // (source, target, key) seen — dedupes when the same logical relation
  // is backed by several per-note definitions and a target is repeated.
  const seen = new Set<string>();
  for (const row of rows) {
    const targets = row.valueJson;
    if (!Array.isArray(targets)) continue;
    const key = keyByDefId.get(row.propertyId);
    if (!key) continue;
    for (const raw of targets) {
      if (typeof raw !== 'string') continue;
      if (raw === row.noteId) continue;
      if (!nodeIdSet.has(raw)) continue;
      const dedupKey = `${row.noteId}\u0001${raw}\u0001${key}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      edges.push({
        id: `rel:${key}:${row.noteId}:${raw}`,
        source: row.noteId,
        target: raw,
        type: key,
        sourceKind: 'relationProperty',
        propertyKey: key,
      });
    }
  }
  return edges;
}

/** Fetch every distinct relation-property key in one query. */
export async function listAllRelationPropertyKeys(): Promise<string[]> {
  const rows = await db
    .select({ key: propertyDefinitions.key })
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.type, 'relation'))
    .groupBy(propertyDefinitions.key);
  return rows.map((r) => r.key);
}

// Reference unused `sql` import to avoid an extra ts pragma.
void sql;
