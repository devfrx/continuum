import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { links, notes } from '../db/schema.js';

const upsertSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  type: z.string().default('related'),
});

const listQuerySchema = z.object({
  type: z.string().min(1).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export const linkRoutes: FastifyPluginAsync = async (app) => {
  /**
   * List all links. Supports an optional `?type=` filter (e.g. `wikilink`,
   * `related`) for power users; omit the param to receive every edge.
   */
  app.get('/', async (req) => {
    const { type } = listQuerySchema.parse(req.query ?? {});
    const base = db.select().from(links);
    return type ? base.where(eq(links.type, type)) : base;
  });

  app.post('/', async (req) => {
    const body = upsertSchema.parse(req.body);
    const [created] = await db.insert(links).values(body).returning();
    return created;
  });

  app.delete('/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    await db.delete(links).where(eq(links.id, id));
    return { ok: true };
  });

  /**
   * Graph payload for the visualization. Returns every node and every edge
   * regardless of link type (wikilink, related, …) so the UI can colour /
   * filter on the client side.
   */
  app.get('/graph', async () => {
    const [nodeRows, edgeRows] = await Promise.all([
      db.select({ id: notes.id, title: notes.title, kind: notes.kind }).from(notes),
      db.select().from(links),
    ]);
    return {
      nodes: nodeRows.map((n) => ({ id: n.id, label: n.title, kind: n.kind })),
      edges: edgeRows.map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
      })),
    };
  });

  /** All links touching a given note (either as source or target). */
  app.get('/by-note/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return db
      .select()
      .from(links)
      .where(or(eq(links.sourceId, id), eq(links.targetId, id)));
  });
};
