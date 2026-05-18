/**
 * Block-scoped views REST API.
 *
 * A `BlockView` is a saved view that belongs to a single Tiptap
 * `database` block and points at exactly one datasource. The block
 * itself is just a (blockId) handle in the editor JSON; this namespace
 * is therefore keyed by `blockId` instead of by parent database.
 *
 * Routes
 * ──────
 *  GET    /api/block-views?blockId=…              list every view of a block (LexoRank-ordered)
 *  GET    /api/block-views/:viewId                fetch a single view
 *  POST   /api/block-views                        create a view (blockId + dataSourceDatabaseId + type + name)
 *  PATCH  /api/block-views/:viewId                update view (name / type / config / source / position)
 *  DELETE /api/block-views/:viewId                delete a view
 *
 * Datasource lifecycle: when the underlying `databases` row is deleted,
 * its block views are wiped via FK CASCADE on `data_source_database_id`.
 *
 * Mounted under `/api/block-views` from `index.ts`.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/client.js';
import { databases } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import {
  createBlockView,
  deleteBlockView,
  getBlockView,
  listBlockViews,
  updateBlockView,
} from '../services/blockViews.js';

const viewIdParamSchema = z.object({ viewId: z.string().uuid() });

const blockIdQuerySchema = z.object({
  blockId: z.string().min(1).max(120),
});

const viewTypeSchema = z.enum([
  'table',
  'board',
  'gallery',
  'list',
  'calendar',
  'timeline',
  'chart',
  'dashboard',
  'feed',
  'map',
  'form',
]);

const createSchema = z.object({
  blockId: z.string().min(1).max(120),
  dataSourceDatabaseId: z.string().uuid(),
  name: z.string().min(1).max(120),
  type: viewTypeSchema,
  position: z.string().max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  type: viewTypeSchema.optional(),
  position: z.string().max(120).optional(),
  dataSourceDatabaseId: z.string().uuid().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const blockViewRoutes: FastifyPluginAsync = async (app) => {
  // List every view of a block. Empty array when the block has none —
  // which is the canonical "unbound" state surfaced by the embed picker.
  app.get('/', async (req) => {
    const { blockId } = blockIdQuerySchema.parse(req.query ?? {});
    return listBlockViews(blockId);
  });

  app.get('/:viewId', async (req, reply) => {
    const { viewId } = viewIdParamSchema.parse(req.params);
    const view = await getBlockView(viewId);
    if (!view) return reply.notFound('Block view not found');
    return view;
  });

  app.post('/', async (req, reply) => {
    const body = createSchema.parse(req.body);
    // Reject creation against a non-existent / archived-but-deleted
    // datasource early — the FK would also reject, but a typed 404 is
    // friendlier to surface in the UI.
    const [datasource] = await db
      .select({ id: databases.id })
      .from(databases)
      .where(eq(databases.id, body.dataSourceDatabaseId))
      .limit(1);
    if (!datasource) return reply.notFound('Datasource not found');
    return createBlockView(body);
  });

  app.patch('/:viewId', async (req, reply) => {
    const { viewId } = viewIdParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);
    if (body.dataSourceDatabaseId) {
      const [datasource] = await db
        .select({ id: databases.id })
        .from(databases)
        .where(eq(databases.id, body.dataSourceDatabaseId))
        .limit(1);
      if (!datasource) return reply.notFound('Datasource not found');
    }
    const updated = await updateBlockView(viewId, body);
    if (!updated) return reply.notFound('Block view not found');
    return updated;
  });

  app.delete('/:viewId', async (req, reply) => {
    const { viewId } = viewIdParamSchema.parse(req.params);
    const existing = await getBlockView(viewId);
    if (!existing) return reply.notFound('Block view not found');
    await deleteBlockView(viewId);
    return { ok: true } as const;
  });
};
