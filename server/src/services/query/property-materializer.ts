/**
 * Property materializer — builds `GraphPropertySnapshot[]` for a batch of
 * notes given an explicit allow-list of property *keys*.
 *
 * Used exclusively by the graph-query endpoint when the request supplies
 * `includeProperties`. Delegates the heavy lifting to
 * `resolveNotePropertiesBatch` (which resolves every applicable
 * definition for every note) and then filters the resolved entries down
 * to the requested keys — addressing properties by key keeps per-note
 * definitions from leaking definition ids into the wire format and lets
 * a single requested key span any number of backing definitions.
 *
 * Keys the caller passes that don't match anything (or aren't applicable
 * to any note's kind) are silently dropped: a stale saved view shouldn't
 * break the whole graph.
 */
import type { GraphPropertySnapshot, NoteProperty } from '@continuum/shared';
import { resolveNotePropertiesBatch } from '../property-computed.js';

/**
 * For each note id, return the `GraphPropertySnapshot[]` corresponding to
 * the requested property keys — preserving the order of `propertyKeys`
 * so the client can map columns predictably.
 *
 * @param noteIds       Notes to materialise properties for.
 * @param propertyKeys  Property keys to include. Order is preserved in
 *                      the per-note output array. Empty input
 *                      short-circuits to an empty map.
 */
export async function materializeProperties(
  noteIds: string[],
  propertyKeys: string[],
): Promise<Map<string, GraphPropertySnapshot[]>> {
  const out = new Map<string, GraphPropertySnapshot[]>();
  if (noteIds.length === 0 || propertyKeys.length === 0) {
    for (const id of noteIds) out.set(id, []);
    return out;
  }

  const resolved = await resolveNotePropertiesBatch(noteIds, propertyKeys);

  for (const noteId of noteIds) {
    const props = resolved.get(noteId) ?? [];
    const byKey = new Map<string, NoteProperty>();
    for (const p of props) byKey.set(p.definition.key, p);
    const snapshots: GraphPropertySnapshot[] = [];
    for (const key of propertyKeys) {
      const entry = byKey.get(key);
      if (!entry) continue;
      snapshots.push(toSnapshot(entry));
    }
    out.set(noteId, snapshots);
  }
  return out;
}

function toSnapshot(entry: NoteProperty): GraphPropertySnapshot {
  return {
    key: entry.definition.key,
    type: entry.definition.type,
    value: entry.value,
  };
}
