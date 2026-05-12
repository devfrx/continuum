import type { FastifyPluginAsync, FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { eq, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, embeddings, links, folders } from '../db/schema.js';
import { aiManager } from '../ai/manager.js';
import { embedNote } from '../services/notes-embed.js';
import { syncWikilinks } from '../services/notes-wikilinks.js';
import { searchNotes } from '../services/notes-search.js';

const upsertSchema = z.object({
  title: z.string().trim().min(1),
  kind: z.string().trim().min(1).default('note'),
  content: z.string().default(''),
  contentJson: z.unknown().optional(),
  tags: z.array(z.string()).default([]),
  folderId: z.string().uuid().nullable().optional(),
  locked: z.boolean().optional(),
});

/**
 * PUT accepts a partial — clients (e.g. Rename) may want to update only
 * the title without resetting content/kind/tags to their defaults.
 */
const partialUpdateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  kind: z.string().trim().min(1).optional(),
  content: z.string().optional(),
  contentJson: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  folderId: z.string().uuid().nullable().optional(),
  locked: z.boolean().optional(),
});

/** Fields that mutate user content; rejected when the note is locked. */
const MUTATION_FIELDS = [
  'title',
  'kind',
  'content',
  'contentJson',
  'tags',
  'folderId',
] as const;

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
  /**
   * Optional folder scope. When set, only notes inside this folder (and,
   * by default, all its descendants) are searched. `null` is treated as
   * "no scope" rather than "root only" because the root folder doesn't
   * exist as a row — root notes live with `folder_id IS NULL` and would
   * need a separate boolean to express. Use the lexical fallback for that.
   */
  folderId: z.string().uuid().nullable().optional(),
  /** When `folderId` is set, include notes in descendant folders. */
  recursive: z.boolean().default(true),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Categorise embedding-pipeline failures into expected (warn) vs. unexpected
 * (error) so the server logs stay readable when the AI provider is simply
 * offline or the user hasn't loaded an embedding model yet.
 */
function logEmbeddingFailure(log: FastifyBaseLogger, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (/unreachable/i.test(msg)) log.warn({ msg }, 'embedding skipped (no AI provider)');
  else if (/no embedding model/i.test(msg)) log.warn({ msg }, 'embedding skipped (no embedding model loaded)');
  else if (/invalid embedding|NaN|null/i.test(msg)) {
    log.warn({ msg }, 'embedding skipped (invalid embedding model output)');
  } else log.error({ err }, 'embed failed');
}

async function folderExists(folderId: string): Promise<boolean> {
  const [target] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(eq(folders.id, folderId))
    .limit(1);
  return !!target;
}

export const noteRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => db.select().from(notes).orderBy(notes.updatedAt));

  app.get('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [n] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    if (!n) return reply.notFound('Note not found');
    return n;
  });

  app.post('/', async (req, reply) => {
    const body = upsertSchema.parse(req.body);
    if (body.folderId && !(await folderExists(body.folderId))) {
      return reply.notFound('Folder not found');
    }
    const [created] = await db.insert(notes).values(body).returning();

    // fire-and-forget embedding generation
    void embedNote(db, aiManager, created, app.log).catch((e) => {
      logEmbeddingFailure(app.log, e);
    });

    // Wikilink sync is awaited so the client immediately sees the new
    // outgoing edges in subsequent graph reads (see PUT handler for
    // the full rationale).
    try {
      await syncWikilinks(db, created.id, created.content, app.log);
    } catch (err) {
      app.log.warn({ err }, 'wikilink sync failed');
    }

    return created;
  });

  app.put('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = partialUpdateSchema.parse(req.body);
    if (Object.keys(body).length === 0) return reply.badRequest('Empty update');
    if (body.folderId && !(await folderExists(body.folderId))) {
      return reply.notFound('Folder not found');
    }

    // Enforce the lock contract server-side: when the existing note is
    // locked, only `locked` itself may be mutated (typically to unlock).
    // The UI already disables edits, but a stale client / direct API call
    // must not be able to silently bypass the read-only state.
    const [existing] = await db
      .select({ locked: notes.locked })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (!existing) return reply.notFound('Note not found');
    if (existing.locked) {
      const touchesContent = MUTATION_FIELDS.some((k) => k in body);
      if (touchesContent) {
        return reply.code(423).send({
          error: 'note-locked',
          message: 'Note is locked. Unlock it before editing.',
        });
      }
    }

    const [updated] = await db
      .update(notes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    if (!updated) return reply.notFound('Note not found');

    // refresh embeddings only when the textual content actually changed
    if (body.content !== undefined || body.title !== undefined || body.tags !== undefined) {
      await db.delete(embeddings).where(eq(embeddings.noteId, id));
      void embedNote(db, aiManager, updated, app.log).catch((e) => {
        logEmbeddingFailure(app.log, e);
      });
    }

    // Refresh wikilink edges synchronously so the client sees the updated
    // graph topology on its next read. Embeddings stay async (slow / network
    // bound) but wikilinks are pure SQL and must be in place before the
    // PUT response returns — otherwise downstream `GET /api/links/graph`
    // calls (e.g. graph reload after "Link to note") race with the writer
    // and miss the new edges, leaving the user's link "invisible" until a
    // manual refresh.
    if (body.content !== undefined) {
      try {
        await syncWikilinks(db, id, updated.content, app.log);
      } catch (err) {
        app.log.warn({ err }, 'wikilink sync failed');
      }
    }

    return updated;
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [existing] = await db
      .select({ locked: notes.locked })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (existing?.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before deleting.',
      });
    }
    await db.delete(notes).where(eq(notes.id, id));
    return { ok: true };
  });

  /**
   * Clear every note in the workspace.
   *
   * Cascading FKs (`embeddings.note_id`, `links.source_id`, `links.target_id`)
   * use `ON DELETE CASCADE`, so a single `DELETE FROM notes` drops every
   * derived row in one statement — no manual sweep of `embeddings` / `links`
   * is needed. We return the deleted count so the UI can confirm success.
   *
   * Wired to the "Clear all notes" CTA in the Settings → Danger zone panel.
   * The frontend always shows a confirmation modal before reaching here.
   */
  app.delete('/', async () => {
    const [{ count }] = await db
      .select({ count: dsql<number>`count(*)::int` })
      .from(notes);
    await db.delete(notes);
    return { ok: true, deleted: count };
  });

  /**
   * Rebuild embeddings for every note. Useful when the embedding pipeline
   * changes (new model, new normalisation, dimension migration) and the
   * stored vectors no longer reflect the current logic. Runs sequentially
   * to avoid hammering the local AI provider.
   */
  app.post('/reindex', async (_req, reply) => {
    // Pre-flight: refuse to wipe & re-embed every note when no provider has
    // an embedding model loaded. Without this guard the loop below would
    // delete all stored vectors and then fail one note at a time, leaving
    // the user with an empty index and a wall of error logs. The frontend
    // already disables the button, but the API must stay safe if hit
    // directly (curl, integrations, race conditions during model unload).
    const health = await aiManager.health();
    const hasEmbedModel = health.providers.some(
      (p) => p.reachable && (p.models ?? []).some((m) => /embed|embedding/i.test(m.id)),
    );
    if (!hasEmbedModel) {
      return reply.code(503).send({
        error: 'no-embedding-model',
        message:
          'No reachable provider has an embedding model loaded. Load one (e.g. nomic-embed-text) in your provider UI and try again.',
      });
    }

    try {
      await aiManager.embed('embedding health probe');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(503).send({
        error: 'invalid-embedding-model',
        message,
        hint:
          'The loaded embedding model returned invalid vectors. Load a different embedding model or update LM Studio, then try again.',
      });
    }

    const all = await db
      .select({
        id: notes.id,
        title: notes.title,
        content: notes.content,
        tags: notes.tags,
        kind: notes.kind,
      })
      .from(notes);
    await db.delete(embeddings);
    let ok = 0;
    let failed = 0;
    for (const n of all) {
      try {
        await embedNote(db, aiManager, n, app.log);
        ok += 1;
      } catch (err) {
        failed += 1;
        app.log.warn({ err, noteId: n.id }, 'reindex: embed failed');
      }
    }
    return { total: all.length, ok, failed };
  });

  /**
   * Move a single note to a folder (or to root with `folderId: null`).
   * Cheap operation: only touches the `folder_id` column, no embedding
   * recompute, no wikilink rescan.
   */
  app.patch('/:id/move', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const { folderId } = z
      .object({ folderId: z.string().uuid().nullable() })
      .parse(req.body);
    if (folderId && !(await folderExists(folderId))) {
      return reply.notFound('Folder not found');
    }
    const [existing] = await db
      .select({ locked: notes.locked })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (!existing) return reply.notFound('Note not found');
    if (existing.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before moving.',
      });
    }
    const [updated] = await db
      .update(notes)
      .set({ folderId, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    if (!updated) return reply.notFound('Note not found');
    return updated;
  });

  /**
   * Move many notes at once. Returns the count actually updated. Used by
   * drag-and-drop multi-select in the sidebar tree.
   */
  app.post('/bulk-move', async (req, reply) => {
    const { ids, folderId } = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        folderId: z.string().uuid().nullable(),
      })
      .parse(req.body);
    if (folderId && !(await folderExists(folderId))) {
      return reply.notFound('Folder not found');
    }
    const updated = await db
      .update(notes)
      .set({ folderId, updatedAt: new Date() })
      .where(dsql`${notes.id} = ANY(${`{${ids.join(',')}}`}::uuid[]) AND ${notes.locked} = false`)
      .returning({ id: notes.id });
    return { moved: updated.length, skippedLocked: ids.length - updated.length };
  });

  // Backlinks: notes that link TO :id (any link type, wikilink or related).
  app.get('/:id/backlinks', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [target] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (!target) return reply.notFound('Note not found');

    return db
      .select({
        id: notes.id,
        title: notes.title,
        kind: notes.kind,
        snippet: dsql<string>`substring(${notes.content}, 1, 240)`,
        type: links.type,
      })
      .from(links)
      .innerJoin(notes, eq(notes.id, links.sourceId))
      .where(eq(links.targetId, id));
  });

  // Hybrid search: semantic via embeddings (best chunk per note) plus a
  // small lexical bonus when the literal query string appears in the
  // title or a tag. Falls back to pure ILIKE when no provider is reachable.
  app.post('/search', async (req) => {
    const params = searchSchema.parse(req.body);
    return searchNotes(db, aiManager, params, app.log);
  });
};
