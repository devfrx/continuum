/**
 * Property materializer — builds `GraphPropertySnapshot[]` for a batch of
 * notes given an explicit allow-list of property definition ids.
 *
 * Used exclusively by the graph-query endpoint when the request supplies
 * `includeProperties`. Delegates the heavy lifting to
 * `resolveNotePropertiesBatch` so stored values, auto-managed values and
 * computed (formula/rollup/uniqueId) values all flow through the same
 * code path the single-note endpoint uses — keeping a graph snapshot's
 * values byte-identical to what `GET /api/notes/:id/properties` returns.
 *
 * Property ids the caller passes that don't exist (or aren't applicable
 * to any note's kind) are silently dropped: a stale saved view shouldn't
 * break the whole graph.
 */
import type { GraphPropertySnapshot, NoteProperty } from '@continuum/shared';
import { resolveNotePropertiesBatch } from '../property-computed.js';

/**
 * For each note id, return the `GraphPropertySnapshot[]` corresponding to
 * the requested property ids — preserving the order of `propertyIds` so
 * the client can map columns predictably.
 *
 * @param noteIds      Notes to materialise properties for.
 * @param propertyIds  Property definition ids to include. Order is
 *                     preserved in the per-note output array. Empty input
 *                     short-circuits to an empty map.
 */
export async function materializeProperties(
  noteIds: string[],
  propertyIds: string[],
): Promise<Map<string, GraphPropertySnapshot[]>> {
  const out = new Map<string, GraphPropertySnapshot[]>();
  if (noteIds.length === 0 || propertyIds.length === 0) {
    for (const id of noteIds) out.set(id, []);
    return out;
  }

  const resolved = await resolveNotePropertiesBatch(noteIds, propertyIds);

  for (const noteId of noteIds) {
    const props = resolved.get(noteId) ?? [];
    const byId = new Map(props.map((p) => [p.definition.id, p] as const));
    const snapshots: GraphPropertySnapshot[] = [];
    for (const propId of propertyIds) {
      const entry = byId.get(propId);
      if (!entry) continue;
      snapshots.push(toSnapshot(entry));
    }
    out.set(noteId, snapshots);
  }
  return out;
}

function toSnapshot(entry: NoteProperty): GraphPropertySnapshot {
  return {
    propertyId: entry.definition.id,
    key: entry.definition.key,
    type: entry.definition.type,
    value: entry.value,
  };
}
