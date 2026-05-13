import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, or } from 'drizzle-orm';
import { DEFAULT_EDGE_SOURCE_SELECTION, EMPTY_FILTER_GROUP } from '@continuum/shared';
import { db } from '../db/client.js';
import { links, notes } from '../db/schema.js';
import { executeGraphQuery } from '../services/graph/graph-query.js';

const upsertSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  type: z.string().trim().min(1).default('related'),
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

  app.post('/', async (req, reply) => {
    const body = upsertSchema.parse(req.body);
    if (body.sourceId === body.targetId) return reply.badRequest('Self-links are not allowed');

    const endpoints = await db
      .select({ id: notes.id })
      .from(notes)
      .where(or(eq(notes.id, body.sourceId), eq(notes.id, body.targetId)));
    if (endpoints.length !== 2) return reply.notFound('Source or target note not found');

    const [existing] = await db
      .select()
      .from(links)
      .where(and(
        eq(links.sourceId, body.sourceId),
        eq(links.targetId, body.targetId),
        eq(links.type, body.type),
      ))
      .limit(1);
    if (existing) return existing;

    const [created] = await db.insert(links).values(body).returning();
    return created;
  });

  app.delete('/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    await db.delete(links).where(eq(links.id, id));
    return { ok: true };
  });

  /**
   * Graph payload for the visualization. Thin wrapper over the
   * full-featured `executeGraphQuery` so this legacy endpoint shares
   * exactly one assembly path with `POST /api/graph/query`. The response
   * shape is unchanged — `properties` and `metrics` are absent because
   * the request asks for neither.
   */
  app.get('/graph', async () => {
    return executeGraphQuery({
      filter: EMPTY_FILTER_GROUP,
      edgeSources: DEFAULT_EDGE_SOURCE_SELECTION,
      includeProperties: [],
      includeMetrics: false,
    });
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
