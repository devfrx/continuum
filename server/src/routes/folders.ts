/**
 * Folder REST API.
 *
 * Endpoints
 * ─────────
 *   GET    /api/folders              → forest of FolderNode (with note counts)
 *   GET    /api/folders/:id          → single folder + effective inherited values
 *   POST   /api/folders              → create
 *   PATCH  /api/folders/:id          → rename / change icon / color / defaultKind
 *   POST   /api/folders/:id/move     → reparent (with cycle detection) + reorder
 *   DELETE /api/folders/:id          → cascade-deletes subtree; notes go to root
 *
 * Notes living inside a deleted folder fall back to root because the FK on
 * `notes.folder_id` is `ON DELETE SET NULL` — the user keeps their data.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, sql as dsql, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { folders, notes } from '../db/schema.js';
import {
  buildTree,
  effectiveFor,
  rankBetween,
  wouldCreateCycle,
} from '../services/folder-tree.js';

/** Slug must match `[a-z0-9][a-z0-9-]*`. Auto-derived from name when missing. */
const slugRegex = /^[a-z0-9][a-z0-9-]*$/;

const createSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  slug: z.string().regex(slugRegex).max(120).optional(),
  defaultKind: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z.string().regex(slugRegex).max(120).optional(),
  defaultKind: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

const moveSchema = z.object({
  parentId: z.string().uuid().nullable(),
  /** Optional reorder within the new parent. */
  before: z.string().uuid().nullable().optional(),
  after: z.string().uuid().nullable().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/** Lowercase + dashes; collapses runs and trims leading/trailing dashes. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export const folderRoutes: FastifyPluginAsync = async (app) => {
  /** Forest with note counts (notes directly inside each folder). */
  app.get('/', async () => {
    const [rows, counts] = await Promise.all([
      db.select().from(folders).orderBy(asc(folders.position)),
      db.execute(dsql`
        SELECT folder_id AS id, COUNT(*)::int AS n
        FROM ${notes}
        WHERE folder_id IS NOT NULL
        GROUP BY folder_id
      `),
    ]);
    const counter = new Map<string, number>();
    for (const row of counts as unknown as Array<{ id: string; n: number }>) {
      counter.set(row.id, row.n);
    }
    return buildTree(rows, counter);
  });

  app.get('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const all = await db.select().from(folders);
    const target = all.find((f) => f.id === id);
    if (!target) return reply.notFound('Folder not found');
    const byId = new Map(all.map((f) => [f.id, f]));
    return { ...target, effective: effectiveFor(id, byId) };
  });

  app.post('/', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const parentId = body.parentId ?? null;
    const slug = body.slug ?? slugify(body.name);
    if (!slugRegex.test(slug)) {
      return reply.badRequest('Cannot derive a valid slug from name; pass `slug` explicitly');
    }

    // Parent must exist when not null.
    if (parentId) {
      const [p] = await db.select({ id: folders.id }).from(folders).where(eq(folders.id, parentId)).limit(1);
      if (!p) return reply.notFound('Parent folder not found');
    }

    // Position = rank after the current last sibling so creates land at the end.
    const siblings = await db
      .select({ position: folders.position })
      .from(folders)
      .where(parentId ? eq(folders.parentId, parentId) : dsql`${folders.parentId} IS NULL`)
      .orderBy(asc(folders.position));
    const lastPos = siblings.at(-1)?.position ?? null;
    const position = rankBetween(lastPos, null);

    try {
      const [created] = await db
        .insert(folders)
        .values({
          parentId,
          name: body.name,
          slug,
          position,
          defaultKind: body.defaultKind ?? null,
          icon: body.icon ?? null,
          color: body.color ?? null,
        })
        .returning();
      return created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/folders_parent_slug_uniq/.test(msg)) {
        return reply.conflict(`A folder named "${slug}" already exists at this level`);
      }
      throw err;
    }
  });

  app.patch('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);
    if (Object.keys(body).length === 0) return reply.badRequest('Empty update');
    try {
      const [updated] = await db
        .update(folders)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(folders.id, id))
        .returning();
      if (!updated) return reply.notFound('Folder not found');
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/folders_parent_slug_uniq/.test(msg)) {
        return reply.conflict('A sibling folder already uses this slug');
      }
      throw err;
    }
  });

  app.post('/:id/move', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const { parentId, before, after } = moveSchema.parse(req.body);

    const all = await db.select().from(folders);
    const self = all.find((f) => f.id === id);
    if (!self) return reply.notFound('Folder not found');

    if (wouldCreateCycle(id, parentId, all)) {
      return reply.badRequest('Cannot move a folder under itself or one of its descendants');
    }
    if (parentId) {
      const exists = all.some((f) => f.id === parentId);
      if (!exists) return reply.notFound('Target parent not found');
    }

    // Determine the new position rank from `before`/`after` references, both
    // of which (when present) must already live under `parentId`.
    const siblings = all
      .filter((f) => f.parentId === parentId && f.id !== id)
      .sort((a, b) => a.position.localeCompare(b.position));
    const beforePos = before ? siblings.find((s) => s.id === before)?.position ?? null : null;
    const afterPos = after ? siblings.find((s) => s.id === after)?.position ?? null : null;
    // If neither bound is provided, place at the end.
    const lo = beforePos ?? siblings.at(-1)?.position ?? null;
    const hi = afterPos ?? null;
    const position = rankBetween(lo, hi);

    const [updated] = await db
      .update(folders)
      .set({ parentId, position, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return updated;
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const result = await db.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id });
    if (result.length === 0) return reply.notFound('Folder not found');
    return { ok: true };
  });
};
