/**
 * Page projection — given a list of note ids in the desired order, fetch
 * each note row and resolve its full property list (including computed
 * formula / rollup / auto-managed values) via the existing
 * `resolveNoteProperties` service.
 *
 * One `resolveNoteProperties` call per note is acceptable for the M2 page
 * size cap (≤ 200). A bulk variant is tracked as a TODO M6+ alongside the
 * group-bucket and calc-row work, both of which will benefit from a
 * shared batch-loading helper.
 */

import { inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { notes, type NoteRow } from '../../db/schema.js';
import { resolveNoteProperties } from '../property-computed.js';
import type { Note, NoteWithProperties } from '@continuum/shared';

/**
 * Fetch and assemble {@link NoteWithProperties} rows for the supplied
 * note ids, preserving their order.
 */
export async function projectRows(ids: string[]): Promise<NoteWithProperties[]> {
  if (ids.length === 0) return [];

  const rows = await db.select().from(notes).where(inArray(notes.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r] as const));

  const out: NoteWithProperties[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue; // Race: note deleted between page-id fetch and projection.
    const properties = await resolveNoteProperties(id);
    out.push({ note: noteRowToDto(row), properties });
  }
  return out;
}

/**
 * Map a `notes` row to the wire-shape {@link Note}. Local helper to avoid
 * exporting a new symbol from `routes/notes.ts` (which today returns raw
 * rows and relies on Fastify's JSON serialiser to coerce dates).
 */
function noteRowToDto(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    content: row.content,
    contentJson: row.contentJson ?? undefined,
    tags: row.tags,
    folderId: row.folderId,
    locked: row.locked,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
