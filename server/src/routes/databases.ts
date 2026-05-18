/**
 * Notion-like Databases REST API.
 *
 *  Databases
 *  ─────────
 *  GET    /api/databases                          list every database (lightweight)
 *  POST   /api/databases                          create a new database (+ default view)
 *  GET    /api/databases/:id                      fetch a database
 *  PATCH  /api/databases/:id                      update title / icon / lock / archive
 *  DELETE /api/databases/:id                      delete a database (cascades views, schema, memberships)
 *
 *  Views
 *  ─────
 *  GET    /api/databases/:id/views                list saved views
 *  POST   /api/databases/:id/views                create a view
 *  PATCH  /api/databases/:id/views/:viewId        update view (name / type / config)
 *  DELETE /api/databases/:id/views/:viewId        delete a view
 *
 *  Schema (database-scoped property definitions)
 *  ─────────────────────────────────────────────
 *  GET    /api/databases/:id/properties           list the database's property definitions
 *  POST   /api/databases/:id/properties           create a database-scoped definition
 *  POST   /api/databases/:id/properties/reorder   persist the definition order
 *  (PATCH and DELETE flow through `/api/properties/:id`, which is scope-agnostic.)
 *
 *  Rows
 *  ────
 *  POST   /api/databases/:id/rows                 create a row (new note, or link existing)
 *  DELETE /api/databases/:id/rows/:rowId          remove a row (note kept unless deleteNote=true)
 *  POST   /api/databases/:id/rows/reorder         persist the row order
 *
 *  Query
 *  ─────
 *  POST   /api/databases/:id/query                paged row snapshot for a view (or ad-hoc config)
 *
 * Cell updates reuse `PUT /api/notes/:noteId/properties/:propId` — every
 * row is a real note and its values live in the normal property pipeline.
 *
 * Routes are mounted with prefix `/api/databases` in `index.ts`.
 */
import type { FastifyPluginAsync } from 'fastify';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  databaseRows,
  databases,
  propertyDefinitions,
} from '../db/schema.js';
import { slugify } from '../lib/slugify.js';
import {
  configSchemaFor,
  definitionRowToDto,
  propertyTypeSchema,
} from '../services/properties.js';
import {
  createDatabase,
  createDatabaseProperty,
  createRow,
  databaseRowToDto,
  deleteDatabase,
  deleteRow,
  loadDatabaseBundle,
  membershipRowToDto,
  queryDatabaseRows,
  reorderRows,
  updateDatabase,
} from '../services/databases.js';
import type { DatabaseQueryRequest } from '@continuum/shared';

// ───────────────────────────── Schemas ─────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });
const rowParamSchema = z.object({
  id: z.string().uuid(),
  rowId: z.string().uuid(),
});

const createDatabaseSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
});

const updateDatabaseSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
  locked: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const createPropertySchema = z.object({
  key: z.string().min(1).max(60).optional(),
  label: z.string().min(1).max(60),
  type: propertyTypeSchema,
  icon: z.string().min(1).max(60).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.unknown().optional(),
  position: z.string().max(120).optional(),
});

const reorderPropertiesSchema = z.object({
  ids: z.array(z.string().uuid()).max(500),
});

const createRowSchema = z.object({
  noteId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  position: z.string().max(120).optional(),
});

const reorderRowsSchema = z.object({
  ids: z.array(z.string().uuid()).max(2000),
});

const querySchema = z.object({
  config: z.record(z.string(), z.unknown()).optional(),
  pagination: z
    .object({
      offset: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
    .optional(),
});

const deleteRowQuerySchema = z.object({
  deleteNote: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

// ───────────────────────────── Helpers ─────────────────────────────────

function positionForIndex(index: number): string {
  return `p${String((index + 1) * 1000).padStart(8, '0')}`;
}

// ─────────────────────────── Plugin export ─────────────────────────────

export const databaseRoutes: FastifyPluginAsync = async (app) => {
  // ───────────── Databases ─────────────

  app.get('/', async () => {
    const rows = await db.select().from(databases).orderBy(asc(databases.createdAt));
    return rows.map(databaseRowToDto);
  });

  app.post('/', async (req) => {
    const body = createDatabaseSchema.parse(req.body);
    return createDatabase(body);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const bundle = await loadDatabaseBundle(id);
    if (!bundle) return reply.notFound('Database not found');
    return bundle;
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateDatabaseSchema.parse(req.body);
    const updated = await updateDatabase(id, body);
    if (!updated) return reply.notFound('Database not found');
    return updated;
  });

  app.delete('/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    await deleteDatabase(id);
    return { ok: true } as const;
  });

  // ───────────── Schema ─────────────

  app.get('/:id/properties', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [database] = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
    if (!database) return reply.notFound('Database not found');
    const rows = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, id))
      .orderBy(asc(propertyDefinitions.position));
    return rows.map(definitionRowToDto);
  });

  app.post('/:id/properties', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = createPropertySchema.parse(req.body);
    const [database] = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
    if (!database) return reply.notFound('Database not found');

    const key = body.key?.trim() ? slugify(body.key, 60) : slugify(body.label, 60);
    if (!key) return reply.badRequest('Could not derive a valid key from the label');

    const [conflict] = await db
      .select()
      .from(propertyDefinitions)
      .where(
        and(
          eq(propertyDefinitions.databaseId, id),
          eq(propertyDefinitions.key, key),
        ),
      )
      .limit(1);
    if (conflict) {
      return reply.conflict(`A property with key "${key}" already exists for this database`);
    }

    const configParser = configSchemaFor(body.type);
    const config = configParser.parse(body.config ?? { type: body.type });

    const created = await createDatabaseProperty(id, {
      key,
      label: body.label,
      type: body.type,
      icon: body.icon ?? null,
      description: body.description ?? null,
      config,
      position: body.position,
    });
    return definitionRowToDto(created);
  });

  app.post('/:id/properties/reorder', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = reorderPropertiesSchema.parse(req.body);
    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      return reply.badRequest('Duplicate property ids in reorder payload');
    }
    const existing = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, id))
      .orderBy(asc(propertyDefinitions.position));
    const existingIds = new Set(existing.map((r) => r.id));
    const matches =
      body.ids.length === existing.length && body.ids.every((id) => existingIds.has(id));
    if (!matches) {
      return reply.badRequest(
        'Reorder payload must include every property for this database exactly once',
      );
    }
    const updated = await db.transaction(async (tx) => {
      for (const [index, defId] of body.ids.entries()) {
        await tx
          .update(propertyDefinitions)
          .set({ position: positionForIndex(index), updatedAt: new Date() })
          .where(eq(propertyDefinitions.id, defId));
      }
      return tx
        .select()
        .from(propertyDefinitions)
        .where(eq(propertyDefinitions.databaseId, id))
        .orderBy(asc(propertyDefinitions.position));
    });
    return updated.map(definitionRowToDto);
  });

  // ───────────── Rows ─────────────

  app.post('/:id/rows', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = createRowSchema.parse(req.body);
    const [database] = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
    if (!database) return reply.notFound('Database not found');
    return createRow(id, body);
  });

  app.delete('/:id/rows/:rowId', async (req) => {
    const { id, rowId } = rowParamSchema.parse(req.params);
    const { deleteNote } = deleteRowQuerySchema.parse(req.query ?? {});
    await deleteRow(id, rowId, { deleteNote: Boolean(deleteNote) });
    return { ok: true } as const;
  });

  app.post('/:id/rows/reorder', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = reorderRowsSchema.parse(req.body);
    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      return reply.badRequest('Duplicate row ids in reorder payload');
    }
    const existing = await db
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, id));
    const existingIds = new Set(existing.map((r) => r.id));
    const matches =
      body.ids.length === existing.length && body.ids.every((rid) => existingIds.has(rid));
    if (!matches) {
      return reply.badRequest(
        'Reorder payload must include every row for this database exactly once',
      );
    }
    await reorderRows(id, body.ids);
    const refreshed = await db
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, id))
      .orderBy(asc(databaseRows.position));
    return refreshed.map(membershipRowToDto);
  });

  // ───────────── Query ─────────────

  app.post('/:id/query', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = querySchema.parse(req.body ?? {});
    const [database] = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
    if (!database) return reply.notFound('Database not found');
    return queryDatabaseRows(id, body as DatabaseQueryRequest);
  });
};
