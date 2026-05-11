import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, asc, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { kinds, notes } from '../db/schema.js';
import { slugify } from '../lib/slugify.js';

const idParamSchema = z.object({ id: z.string().min(1).max(60) });

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB');

const createSchema = z.object({
  id: z.string().min(1).max(60).optional(),
  label: z.string().min(1).max(60),
  color: colorSchema,
  icon: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
});

const updateSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  color: colorSchema.optional(),
  icon: z.string().min(1).max(60).optional(),
  description: z.string().max(200).nullable().optional(),
});

/**
 * REST CRUD for user-defined note categories. The `'note'` kind is the only
 * built-in row and is protected from edits and deletion.
 */
export const kindRoutes: FastifyPluginAsync = async (app) => {
  // List — builtin first, then by label.
  app.get('/', async () =>
    db.select().from(kinds).orderBy(desc(kinds.builtin), asc(kinds.label)),
  );

  app.post('/', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const id = (body.id?.trim() ? slugify(body.id, 60) : slugify(body.label, 60));
    if (!id) return reply.badRequest('Could not derive a valid id from the label');

    const [existing] = await db.select().from(kinds).where(eq(kinds.id, id)).limit(1);
    if (existing) return reply.conflict(`A kind with id "${id}" already exists`);

    const [created] = await db
      .insert(kinds)
      .values({
        id,
        label: body.label,
        color: body.color,
        icon: body.icon,
        description: body.description ?? null,
        builtin: false,
      })
      .returning();
    return created;
  });

  app.put('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);

    const [existing] = await db.select().from(kinds).where(eq(kinds.id, id)).limit(1);
    if (!existing) return reply.notFound('Kind not found');
    if (existing.builtin) return reply.forbidden('Built-in kinds cannot be edited');

    const [updated] = await db
      .update(kinds)
      .set({
        label: body.label ?? existing.label,
        color: body.color ?? existing.color,
        icon: body.icon ?? existing.icon,
        description:
          body.description === undefined ? existing.description : body.description,
        updatedAt: new Date(),
      })
      .where(eq(kinds.id, id))
      .returning();
    return updated;
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [existing] = await db.select().from(kinds).where(eq(kinds.id, id)).limit(1);
    if (!existing) return reply.notFound('Kind not found');
    if (existing.builtin) return reply.forbidden('Built-in kinds cannot be deleted');

    // Reassign affected notes to 'note' inside a single transaction, then
    // remove the category. Drizzle's transaction helper rolls back on throw.
    await db.transaction(async (tx) => {
      await tx.update(notes).set({ kind: 'note' }).where(eq(notes.kind, id));
      await tx.delete(kinds).where(eq(kinds.id, id));
    });
    return { ok: true };
  });
};
