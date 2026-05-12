/**
 * Database Views REST API.
 *
 *  Endpoints
 *  ─────────
 *  GET    /api/kinds/:kindId/views                  → ViewSummaryDto[]
 *  POST   /api/kinds/:kindId/views                  → DatabaseView
 *  GET    /api/kinds/:kindId/views/:viewId          → DatabaseView
 *  PATCH  /api/kinds/:kindId/views/:viewId          → DatabaseView
 *  DELETE /api/kinds/:kindId/views/:viewId          → 204
 *  POST   /api/kinds/:kindId/views/:viewId/duplicate → DatabaseView
 *  POST   /api/kinds/:kindId/views/reorder          → ViewSummaryDto[]
 *
 * The routes are mounted with a generic `/api` prefix in `index.ts`.
 *
 * Invariants (enforced server-side, mirrored by the partial unique index
 * `views_one_default_per_kind_uniq`):
 *  - The owning Kind must exist.
 *  - Every Kind has at least one view at all times.
 *  - Exactly one view per Kind is flagged `isDefault = true`.
 *  - `position` is a LexoRank string used to order tabs in the view-bar.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, inArray, not } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, propertyDefinitions, views } from '../db/schema.js';
import {
  createDefaultViewConfig,
  databaseViewConfigSchema,
  queryRequestSchema,
  type ColumnConfig,
  type DatabaseViewConfig,
  type NoteWithProperties,
} from '@continuum/shared';
import {
  kindExists,
  nextPosition,
  positionForIndex,
  parseConfig,
  rowToDto,
  rowToSummary,
} from './views.helpers.js';
import { runViewQuery } from '../services/views/index.js';
import { rowsToCsv } from '../services/views/csv.js';

// ───────────────────────────── Schemas ─────────────────────────────────

const kindIdParamSchema = z.object({ kindId: z.string().min(1).max(60) });
const viewParamSchema = z.object({
  kindId: z.string().min(1).max(60),
  viewId: z.string().uuid(),
});

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  config: databaseViewConfigSchema.optional(),
});

const updateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    locked: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    config: databaseViewConfigSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: 'Body must contain at least one field',
  });

const reorderBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

// ─────────────────────────── Plugin export ─────────────────────────────

export const viewRoutes: FastifyPluginAsync = async (app) => {
  // ───────────── List views for a kind ─────────────
  app.get('/kinds/:kindId/views', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const rows = await db
      .select()
      .from(views)
      .where(eq(views.kindId, kindId))
      .orderBy(asc(views.position));
    return rows.map(rowToSummary);
  });

  // ───────────── Create a view ─────────────
  app.post('/kinds/:kindId/views', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const body = createBodySchema.parse(req.body);
    const config: DatabaseViewConfig = body.config ?? createDefaultViewConfig(kindId);

    // The position lookup, "is-first" check and the insert all live in the
    // same transaction so two concurrent CREATEs for the same kind cannot
    // both observe `count=0` and race the partial unique index on
    // `is_default`.
    const created = await db.transaction(async (tx) => {
      const siblings = await tx
        .select({ position: views.position })
        .from(views)
        .where(eq(views.kindId, kindId))
        .orderBy(asc(views.position));
      const isFirst = siblings.length === 0;
      const position = isFirst ? 'a0' : `${siblings[siblings.length - 1].position}m`;

      const [row] = await tx
        .insert(views)
        .values({ kindId, name: body.name, isDefault: isFirst, locked: false, position, config })
        .returning();
      return row;
    });
    return rowToDto(created);
  });

  // ───────────── Reorder views ─────────────
  // Declared before `/:viewId` so `reorder` is not parsed as a uuid.
  app.post('/kinds/:kindId/views/reorder', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const body = reorderBodySchema.parse(req.body);
    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      return reply.badRequest('Duplicate view ids in reorder payload');
    }

    const existing = await db
      .select()
      .from(views)
      .where(eq(views.kindId, kindId))
      .orderBy(asc(views.position));
    if (existing.length !== body.ids.length) {
      return reply.badRequest('Reorder payload must include every view for this kind exactly once');
    }
    const existingIds = new Set(existing.map((row) => row.id));
    if (!body.ids.every((id) => existingIds.has(id))) {
      return reply.badRequest('Reorder payload references unknown view ids');
    }

    const updated = await db.transaction(async (tx) => {
      for (const [index, id] of body.ids.entries()) {
        await tx
          .update(views)
          .set({ position: positionForIndex(index), updatedAt: new Date() })
          .where(eq(views.id, id));
      }
      return tx
        .select()
        .from(views)
        .where(eq(views.kindId, kindId))
        .orderBy(asc(views.position));
    });

    return updated.map(rowToSummary);
  });

  // ───────────── Get one view ─────────────
  app.get('/kinds/:kindId/views/:viewId', async (req, reply) => {
    const { kindId, viewId } = viewParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const [row] = await db
      .select()
      .from(views)
      .where(and(eq(views.id, viewId), eq(views.kindId, kindId)))
      .limit(1);
    if (!row) return reply.notFound('View not found');
    return rowToDto(row);
  });

  // ───────────── Patch a view ─────────────
  app.patch('/kinds/:kindId/views/:viewId', async (req, reply) => {
    const { kindId, viewId } = viewParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const body = updateBodySchema.parse(req.body);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(views)
        .where(and(eq(views.id, viewId), eq(views.kindId, kindId)))
        .limit(1);
      if (!existing) return { error: 'not-found' as const };
      // Refuse to un-default the only default view.
      if (body.isDefault === false && existing.isDefault) {
        return { error: 'must-have-default' as const };
      }

      const nextName = body.name ?? existing.name;
      const nextLocked = body.locked ?? existing.locked;
      const nextIsDefault = body.isDefault ?? existing.isDefault;

      // When promoting to default, clear the flag on every sibling first
      // so the partial unique index never sees two defaults at once.
      if (body.isDefault === true && !existing.isDefault) {
        await tx
          .update(views)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(eq(views.kindId, kindId), not(eq(views.id, viewId))));
      }

      const [row] = await tx
        .update(views)
        .set({
          name: nextName,
          locked: nextLocked,
          isDefault: nextIsDefault,
          // Only overwrite the JSONB blob when the client sent one.
          ...(body.config ? { config: body.config } : {}),
          updatedAt: new Date(),
        })
        .where(eq(views.id, viewId))
        .returning();
      return { row };
    });

    if ('error' in result) {
      if (result.error === 'not-found') return reply.notFound('View not found');
      return reply.badRequest('At least one view must be default');
    }
    return rowToDto(result.row);
  });

  // ───────────── Delete a view ─────────────
  app.delete('/kinds/:kindId/views/:viewId', async (req, reply) => {
    const { kindId, viewId } = viewParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(views)
        .where(and(eq(views.id, viewId), eq(views.kindId, kindId)))
        .limit(1);
      if (!existing) return { error: 'not-found' as const };

      const siblings = await tx
        .select()
        .from(views)
        .where(and(eq(views.kindId, kindId), not(eq(views.id, viewId))))
        .orderBy(asc(views.position), asc(views.id));
      if (siblings.length === 0) return { error: 'last-view' as const };

      await tx.delete(views).where(eq(views.id, viewId));

      // Promote the lexicographically-first remaining sibling when needed.
      if (existing.isDefault) {
        const promote = siblings[0];
        await tx
          .update(views)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(views.id, promote.id));
      }
      return { ok: true as const };
    });

    if ('error' in result) {
      if (result.error === 'not-found') return reply.notFound('View not found');
      return reply.badRequest('Cannot delete the only view of a kind');
    }
    return reply.code(204).send();
  });

  // ───────────── Duplicate a view ─────────────
  app.post('/kinds/:kindId/views/:viewId/duplicate', async (req, reply) => {
    const { kindId, viewId } = viewParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const [source] = await db
      .select()
      .from(views)
      .where(and(eq(views.id, viewId), eq(views.kindId, kindId)))
      .limit(1);
    if (!source) return reply.notFound('View not found');

    const newName = `${source.name} (copy)`;
    const newPosition = await nextPosition(kindId);
    // Deep-clone the config blob so mutations on either copy stay isolated.
    const clonedConfig = JSON.parse(JSON.stringify(source.config ?? {})) as DatabaseViewConfig;

    const [created] = await db
      .insert(views)
      .values({
        kindId,
        name: newName,
        isDefault: false,
        locked: false,
        position: newPosition,
        config: clonedConfig,
      })
      .returning();
    return rowToDto(created);
  });

  // ───────────── Run a view query (M2 engine) ─────────────
  //
  // Body shape: see `queryRequestSchema` (`@continuum/shared`).
  //   - `view: { viewId }`         → load persisted view, 404 on kind mismatch.
  //   - `view: { config }`         → ad-hoc unsaved config (already validated
  //                                  by the request schema).
  //   - `view: DatabaseView`       → fully inlined view — only `.config` is used.
  //
  // A malformed cursor surfaces from the engine as `Error('cursor-malformed')`
  // and is mapped to a 400 below; everything else propagates to the global
  // error handler.
  app.post('/kinds/:kindId/query', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const body = queryRequestSchema.parse(req.body);

    // Resolve the view spec into a usable `DatabaseViewConfig`.
    let config: DatabaseViewConfig;
    if ('viewId' in body.view) {
      const [row] = await db
        .select()
        .from(views)
        .where(and(eq(views.id, body.view.viewId), eq(views.kindId, kindId)))
        .limit(1);
      if (!row) return reply.notFound('View not found');
      config = parseConfig(row);
    } else if ('config' in body.view) {
      config = body.view.config;
    } else {
      // Fully inlined `DatabaseView` — pull the config and ignore the rest.
      config = body.view;
    }

    try {
      return await runViewQuery(
        kindId,
        { config },
        { cursor: body.cursor ?? null, pageSize: body.pageSize },
      );
    } catch (err) {
      if (err instanceof Error && err.message === 'cursor-malformed') {
        return reply.badRequest('Malformed cursor');
      }
      throw err;
    }
  });

  // ───────────── Export a view as CSV (M10) ─────────────
  //
  // Accepts the same body shape as `/query` (a `QueryRequest`) but ignores
  // `cursor` / `pageSize`: the route walks `runViewQuery` to completion
  // (max `EXPORT_HARD_CAP` rows) and serialises the result in one shot.
  //
  // Column projection rules:
  //   - When the view has columns, take `visible: true` only and order by
  //     LexoRank `position`.
  //   - When `view.columns` is empty (e.g. a brand-new view), fall back to
  //     ALL property defs of the kind, in their stored order.
  //
  // Relation cells are resolved to target note titles via a single batched
  // lookup; ids without a matching note fall back to the raw UUID.
  app.post('/kinds/:kindId/export.csv', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    if (!(await kindExists(kindId))) return reply.notFound(`Kind "${kindId}" not found`);

    const body = queryRequestSchema.parse(req.body);

    // Resolve view spec → { name, config }. `name` drives the filename.
    let viewName: string;
    let config: DatabaseViewConfig;
    if ('viewId' in body.view) {
      const [row] = await db
        .select()
        .from(views)
        .where(and(eq(views.id, body.view.viewId), eq(views.kindId, kindId)))
        .limit(1);
      if (!row) return reply.notFound('View not found');
      viewName = row.name;
      config = parseConfig(row);
    } else if ('config' in body.view) {
      viewName = 'export';
      config = body.view.config;
    } else {
      viewName = body.view.name;
      config = body.view;
    }

    // Walk the view query until exhausted or we hit the hard ceiling.
    const all: NoteWithProperties[] = [];
    let cursor: string | null = null;
    let capped = false;
    while (true) {
      let page;
      try {
        page = await runViewQuery(kindId, { config }, { cursor, pageSize: EXPORT_PAGE_SIZE });
      } catch (err) {
        if (err instanceof Error && err.message === 'cursor-malformed') {
          return reply.badRequest('Malformed cursor');
        }
        throw err;
      }
      all.push(...page.rows);
      if (all.length >= EXPORT_HARD_CAP) {
        all.length = EXPORT_HARD_CAP;
        capped = true;
        break;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    if (capped) {
      app.log.warn(
        { kindId, viewName, cap: EXPORT_HARD_CAP },
        '[views] CSV export hit hard row cap; output truncated',
      );
    }

    // Property definitions for the kind (label lookup + fallback projection).
    const defs = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.kindId, kindId))
      .orderBy(asc(propertyDefinitions.position));

    const columns = projectColumns(config.columns, defs);

    // Batched relation-title lookup. Walk every property value across the
    // collected rows once, dedupe target ids, then issue a single SELECT.
    const relationIds = new Set<string>();
    for (const row of all) {
      for (const p of row.properties) {
        if (p.value && p.value.type === 'relation') {
          for (const id of p.value.value) relationIds.add(id);
        }
      }
    }
    const relationTitles = new Map<string, string>();
    if (relationIds.size > 0) {
      const titleRows = await db
        .select({ id: notes.id, title: notes.title })
        .from(notes)
        .where(inArray(notes.id, [...relationIds]));
      for (const r of titleRows) relationTitles.set(r.id, r.title);
    }

    const csv = rowsToCsv(all, defs, columns, { relationTitles });

    const safeName =
      viewName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'export';
    const date = new Date().toISOString().slice(0, 10);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header(
      'Content-Disposition',
      `attachment; filename="${safeName}-${date}.csv"`,
    );
    return csv;
  });
};

// ───────────────────────── CSV-export helpers ──────────────────────────

/** Internal page size when walking `runViewQuery`. Equals QUERY_PAGE_SIZE_MAX. */
const EXPORT_PAGE_SIZE = 200;
/** Hard ceiling on total rows exported in a single CSV. */
const EXPORT_HARD_CAP = 5000;

/**
 * Pick the columns to render in the CSV.
 *
 *  - When `viewColumns` has entries, keep the visible ones, sorted by
 *    LexoRank `position`.
 *  - When `viewColumns` is empty, fall back to ALL property defs of the
 *    kind in their stored order, materialised as synthetic visible
 *    {@link ColumnConfig}s so {@link rowsToCsv} can iterate uniformly.
 */
function projectColumns(
  viewColumns: ColumnConfig[],
  defs: { key: string; position: string }[],
): ColumnConfig[] {
  if (viewColumns.length === 0) {
    return defs.map((d) => ({
      propertyKey: d.key,
      visible: true,
      width: null,
      position: d.position,
      frozen: false,
      wrap: false,
    }));
  }
  return viewColumns
    .filter((c) => c.visible)
    .slice()
    .sort((a, b) => a.position.localeCompare(b.position));
}
