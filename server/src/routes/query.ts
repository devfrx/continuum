/**
 * Field-catalogue route.
 *
 * One endpoint:
 *
 *   GET /api/query/fields?surface=graph|note   →  FieldCatalog
 *
 * The web app calls this once per surface to populate the filter UI's
 * field picker. Keeping the catalogue server-side means a fresh kind or
 * property definition is visible immediately without a client rebuild.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildFieldCatalog } from '../services/query/field-catalog.js';

const surfaceQuerySchema = z.object({
  surface: z.enum(['graph', 'note']).default('graph'),
});

export const queryRoutes: FastifyPluginAsync = async (app) => {
  app.get('/query/fields', async (req) => {
    const { surface } = surfaceQuerySchema.parse(req.query ?? {});
    return buildFieldCatalog({ surface });
  });
};
