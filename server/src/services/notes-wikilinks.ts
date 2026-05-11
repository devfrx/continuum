/**
 * Wikilink edge synchronisation for notes.
 *
 * Pure service module: callers pass the drizzle client so this code is
 * independent of the global `db` singleton. Wikilink parsing itself is
 * delegated to the `lib/wikilinks.ts` shim which re-exports the canonical
 * `@continuum/shared` implementation, keeping the server and the web client
 * in agreement on parsing semantics.
 */

import type { FastifyBaseLogger } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { links, notes } from '../db/schema.js';
import { extractWikilinks } from '../lib/wikilinks.js';

/**
 * Synchronise `links` rows of type `wikilink` for a given source note.
 *
 * Replaces the full set of wikilink edges originating from `noteId` with the
 * ones currently present in `content`. Self-links and unresolved titles are
 * skipped. Other link types (e.g. `related`) are left untouched.
 */
export async function syncWikilinks(
  db: DB,
  noteId: string,
  content: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const titles = extractWikilinks(content);

  // Always clear previous wikilink edges for this source so deletions propagate.
  await db.delete(links).where(and(eq(links.sourceId, noteId), eq(links.type, 'wikilink')));

  if (titles.length === 0) return;

  const allNotes = await db.select({ id: notes.id, title: notes.title }).from(notes);
  const byTitle = new Map<string, string>();
  for (const n of allNotes) byTitle.set(n.title.toLowerCase(), n.id);

  const rows: Array<{ sourceId: string; targetId: string; type: string }> = [];
  for (const t of titles) {
    const targetId = byTitle.get(t.toLowerCase());
    if (!targetId || targetId === noteId) continue;
    rows.push({ sourceId: noteId, targetId, type: 'wikilink' });
  }

  if (rows.length === 0) {
    log.debug({ noteId, titles }, 'no wikilink targets resolved');
    return;
  }

  await db.insert(links).values(rows);
}
