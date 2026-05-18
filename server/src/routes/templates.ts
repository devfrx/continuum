/**
 * Page Templates REST API.
 *
 *  Catalog
 *  ───────
 *  GET    /api/templates                          list every template (with properties)
 *  GET    /api/templates/:id                      load a single template
 *  POST   /api/templates                          create a blank template
 *  PATCH  /api/templates/:id                      update body / metadata (bumps version)
 *  DELETE /api/templates/:id                      delete a template (cascades properties)
 *
 *  Authoring helpers
 *  ────────────────
 *  POST   /api/templates/from-note                snapshot an existing note into a new template
 *
 *  Property schema (inside a template)
 *  ───────────────────────────────────
 *  POST   /api/templates/:id/properties           append a property
 *  PATCH  /api/templates/:id/properties/:propId   patch a property (label/icon/config/default/position)
 *  DELETE /api/templates/:id/properties/:propId   remove a property
 *  POST   /api/templates/:id/properties/reorder   persist a full ordering of property ids
 *
 *  Instantiation against notes
 *  ───────────────────────────
 *  POST   /api/templates/:id/notes                create a new note pre-populated by the template
 *  POST   /api/notes/:noteId/template-preview     dry-run a merge of a template into an existing note
 *  POST   /api/notes/:noteId/apply-template       apply a template to an existing note
 *
 * Mounted with prefix `/api` from `server/src/index.ts`.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import type {
  PageTemplate,
  PropertyConfig,
  PropertyType,
  PropertyValue,
  TemplateApplicationOptions,
} from '@continuum/shared';
import {
  PROPERTY_TYPES,
  isComputedPropertyType,
} from '@continuum/shared';
import { db } from '../db/client.js';
import {
  notes,
  pageTemplates,
  propertyDefinitions,
  templateProperties,
  type TemplatePropertyRow,
} from '../db/schema.js';
import { slugify } from '../lib/slugify.js';
import {
  bumpTemplateVersion,
  listTemplates,
  loadTemplate,
  pageTemplateRowToDto,
  parseConfig,
  parseDefaultValue,
} from '../services/page-templates.js';
import {
  applyTemplate,
  previewTemplateApplication,
} from '../services/template-application.js';
import { resolveNoteProperties } from '../services/property-computed.js';

// ─────────────────────────── Schemas ───────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });
const templatePropParamSchema = z.object({
  id: z.string().uuid(),
  propId: z.string().uuid(),
});
const noteIdParamSchema = z.object({ noteId: z.string().uuid() });

const propertyTypeSchema = z.enum(PROPERTY_TYPES);

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  targetKind: z.string().min(1).max(60).nullable().optional(),
  content: z.string().max(200_000).optional(),
  contentJson: z.unknown().nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  targetKind: z.string().min(1).max(60).nullable().optional(),
  content: z.string().max(200_000).optional(),
  contentJson: z.unknown().nullable().optional(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
});

const fromNoteSchema = z.object({
  noteId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  /** When true, copy the note's note-scoped property definitions into the template. */
  includeProperties: z.boolean().default(true),
  /** When true, capture each included property's current value as the template default. */
  captureDefaults: z.boolean().default(false),
});

const createPropertySchema = z.object({
  key: z.string().min(1).max(60).optional(),
  label: z.string().min(1).max(60),
  type: propertyTypeSchema,
  icon: z.string().min(1).max(60).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.unknown().optional(),
  defaultValue: z.unknown().nullable().optional(),
  position: z.string().max(120).optional(),
});

const updatePropertySchema = z.object({
  label: z.string().min(1).max(60).optional(),
  icon: z.string().min(1).max(60).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.unknown().optional(),
  defaultValue: z.unknown().nullable().optional(),
  position: z.string().max(120).optional(),
});

const reorderPropertiesSchema = z.object({
  ids: z.array(z.string().uuid()).max(500),
});

const applyOptionsSchema = z
  .object({
    contentPlacement: z.enum(['append', 'prepend', 'replace-empty-only']).optional(),
    mergeTags: z.boolean().optional(),
    applyDefaults: z.boolean().optional(),
  })
  .optional();

const applyTemplateSchema = z.object({
  templateId: z.string().uuid(),
  options: applyOptionsSchema,
});

const createNoteFromTemplateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.string().min(1).max(60).optional(),
  folderId: z.string().uuid().nullable().optional(),
  /** Extra options forwarded to the template-application merge logic. */
  options: applyOptionsSchema,
});

// ─────────────────────────── Helpers ───────────────────────────────────

function lastPositionOf(rows: { position: string }[]): string {
  if (rows.length === 0) return 'a0';
  return rows.reduce((acc, r) => (r.position > acc ? r.position : acc), 'a0');
}

function positionForIndex(index: number): string {
  return `p${String((index + 1) * 1000).padStart(8, '0')}`;
}

async function nextPositionForTemplate(templateId: string): Promise<string> {
  const rows = await db
    .select({ position: templateProperties.position })
    .from(templateProperties)
    .where(eq(templateProperties.templateId, templateId))
    .orderBy(asc(templateProperties.position));
  return `${lastPositionOf(rows)}m`;
}

// ─────────────────────────── Plugin export ────────────────────────────

export const templateRoutes: FastifyPluginAsync = async (app) => {
  // ───────────── List ─────────────
  app.get('/templates', async () => listTemplates());

  // ───────────── Get one ─────────────
  app.get('/templates/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const tpl = await loadTemplate(id);
    if (!tpl) return reply.notFound('Template not found');
    return tpl;
  });

  // ───────────── Create ─────────────
  app.post('/templates', async (req) => {
    const body = createTemplateSchema.parse(req.body);
    const [row] = await db
      .insert(pageTemplates)
      .values({
        name: body.name,
        description: body.description ?? null,
        targetKind: body.targetKind ?? null,
        content: body.content ?? '',
        contentJson: body.contentJson ?? null,
        tags: body.tags ?? [],
      })
      .returning();
    return pageTemplateRowToDto(row, []);
  });

  // ───────────── Patch metadata / body ─────────────
  app.patch('/templates/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateTemplateSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(pageTemplates)
      .where(eq(pageTemplates.id, id))
      .limit(1);
    if (!existing) return reply.notFound('Template not found');

    const patch: Partial<typeof pageTemplates.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.targetKind !== undefined) patch.targetKind = body.targetKind;
    if (body.content !== undefined) patch.content = body.content;
    if (body.contentJson !== undefined) patch.contentJson = body.contentJson ?? null;
    if (body.tags !== undefined) patch.tags = body.tags;

    // Bump version when body / properties-influencing fields change.
    if (
      body.content !== undefined ||
      body.contentJson !== undefined ||
      body.tags !== undefined
    ) {
      patch.version = (existing.version ?? 1) + 1;
    }

    await db.update(pageTemplates).set(patch).where(eq(pageTemplates.id, id));
    const refreshed = await loadTemplate(id);
    return refreshed as PageTemplate;
  });

  // ───────────── Delete ─────────────
  app.delete('/templates/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [existing] = await db
      .select({ id: pageTemplates.id })
      .from(pageTemplates)
      .where(eq(pageTemplates.id, id))
      .limit(1);
    if (!existing) return reply.notFound('Template not found');
    await db.delete(pageTemplates).where(eq(pageTemplates.id, id));
    return { ok: true };
  });

  // ───────────── Snapshot from existing note ─────────────
  app.post('/templates/from-note', async (req, reply) => {
    const body = fromNoteSchema.parse(req.body);
    const [note] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, body.noteId))
      .limit(1);
    if (!note) return reply.notFound('Note not found');

    const [created] = await db
      .insert(pageTemplates)
      .values({
        name: body.name,
        description: body.description ?? null,
        targetKind: note.kind,
        content: note.content,
        contentJson: note.contentJson ?? null,
        tags: note.tags,
      })
      .returning();

    if (body.includeProperties) {
      const defs = await db
        .select()
        .from(propertyDefinitions)
        .where(
          and(
            eq(propertyDefinitions.noteId, body.noteId),
            eq(propertyDefinitions.scope, 'note'),
          ),
        )
        .orderBy(asc(propertyDefinitions.position));

      let values: Record<string, PropertyValue | null> = {};
      if (body.captureDefaults && defs.length > 0) {
        const notePropsList = await resolveNoteProperties(body.noteId);
        values = Object.fromEntries(
          notePropsList.map((p) => [p.definition.id, p.value ?? null]),
        );
      }

      if (defs.length > 0) {
        await db.insert(templateProperties).values(
          defs.map((d) => ({
            templateId: created.id,
            key: d.key,
            label: d.label,
            type: d.type,
            icon: d.icon,
            description: d.description,
            config: d.config as PropertyConfig,
            defaultValue: body.captureDefaults
              ? sanitizeDefault(d.type as PropertyType, values[d.id] ?? null)
              : null,
            position: d.position,
          })),
        );
      }
    }

    const refreshed = await loadTemplate(created.id);
    return refreshed as PageTemplate;
  });

  // ───────────── Append a property ─────────────
  app.post('/templates/:id/properties', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = createPropertySchema.parse(req.body);

    const [tpl] = await db
      .select()
      .from(pageTemplates)
      .where(eq(pageTemplates.id, id))
      .limit(1);
    if (!tpl) return reply.notFound('Template not found');

    const key = body.key?.trim() ? slugify(body.key, 60) : slugify(body.label, 60);
    if (!key) return reply.badRequest('Could not derive a valid key from the label');

    const [existing] = await db
      .select({ id: templateProperties.id })
      .from(templateProperties)
      .where(
        and(eq(templateProperties.templateId, id), eq(templateProperties.key, key)),
      )
      .limit(1);
    if (existing) return reply.conflict(`Property "${key}" already exists in this template`);

    const config = parseConfig(body.type, body.config);

    let defaultValue: PropertyValue | null = null;
    if (body.defaultValue !== undefined && body.defaultValue !== null) {
      if (
        body.type === 'button' ||
        isComputedPropertyType(body.type)
      ) {
        return reply.badRequest(`Cannot set default for '${body.type}': computed property.`);
      }
      try {
        defaultValue = parseDefaultValue(body.type, config, body.defaultValue);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'invalid default';
        return reply.badRequest(`Invalid default value: ${message}`);
      }
    }

    const position = body.position ?? (await nextPositionForTemplate(id));

    await db
      .insert(templateProperties)
      .values({
        templateId: id,
        key,
        label: body.label,
        type: body.type,
        icon: body.icon ?? null,
        description: body.description ?? null,
        config,
        defaultValue,
        position,
      })
      .returning();

    await bumpTemplateVersion(id);
    const refreshed = await loadTemplate(id);
    return refreshed as PageTemplate;
  });

  // ───────────── Patch a property ─────────────
  app.patch('/templates/:id/properties/:propId', async (req, reply) => {
    const { id, propId } = templatePropParamSchema.parse(req.params);
    const body = updatePropertySchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(templateProperties)
      .where(
        and(eq(templateProperties.templateId, id), eq(templateProperties.id, propId)),
      )
      .limit(1);
    if (!existing) return reply.notFound('Template property not found');

    const patch: Partial<TemplatePropertyRow> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (body.label !== undefined) patch.label = body.label;
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.description !== undefined) patch.description = body.description;
    if (body.position !== undefined) patch.position = body.position;

    let effectiveConfig = existing.config as PropertyConfig;
    if (body.config !== undefined) {
      effectiveConfig = parseConfig(existing.type as PropertyType, body.config);
      patch.config = effectiveConfig;
    }
    if (body.defaultValue !== undefined) {
      if (body.defaultValue === null) {
        patch.defaultValue = null;
      } else if (
        existing.type === 'button' ||
        isComputedPropertyType(existing.type as PropertyType)
      ) {
        return reply.badRequest(`Cannot set default for '${existing.type}': computed property.`);
      } else {
        try {
          patch.defaultValue = parseDefaultValue(
            existing.type as PropertyType,
            effectiveConfig,
            body.defaultValue,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : 'invalid default';
          return reply.badRequest(`Invalid default value: ${message}`);
        }
      }
    }

    await db
      .update(templateProperties)
      .set(patch)
      .where(eq(templateProperties.id, propId))
      .returning();
    await bumpTemplateVersion(id);
    const refreshed = await loadTemplate(id);
    return refreshed as PageTemplate;
  });

  // ───────────── Delete a property ─────────────
  app.delete('/templates/:id/properties/:propId', async (req, reply) => {
    const { id, propId } = templatePropParamSchema.parse(req.params);
    const [existing] = await db
      .select({ id: templateProperties.id })
      .from(templateProperties)
      .where(
        and(eq(templateProperties.templateId, id), eq(templateProperties.id, propId)),
      )
      .limit(1);
    if (!existing) return reply.notFound('Template property not found');
    await db.delete(templateProperties).where(eq(templateProperties.id, propId));
    await bumpTemplateVersion(id);
    const refreshed = await loadTemplate(id);
    return refreshed as PageTemplate;
  });

  // ───────────── Reorder properties ─────────────
  app.post('/templates/:id/properties/reorder', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = reorderPropertiesSchema.parse(req.body);

    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      return reply.badRequest('Duplicate property ids in reorder payload');
    }

    const existing = await db
      .select()
      .from(templateProperties)
      .where(eq(templateProperties.templateId, id))
      .orderBy(asc(templateProperties.position));

    const existingIds = new Set(existing.map((r) => r.id));
    const matches = body.ids.length === existing.length
      && body.ids.every((p) => existingIds.has(p));
    if (!matches) {
      return reply.badRequest('Reorder payload must include every property exactly once');
    }

    await db.transaction(async (tx) => {
      for (const [index, propId] of body.ids.entries()) {
        await tx
          .update(templateProperties)
          .set({ position: positionForIndex(index), updatedAt: new Date() })
          .where(eq(templateProperties.id, propId));
      }
    });
    await bumpTemplateVersion(id);

    const refreshed = await loadTemplate(id);
    return refreshed as PageTemplate;
  });

  // ───────────── Create a new note from a template ─────────────
  app.post('/templates/:id/notes', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = createNoteFromTemplateSchema.parse(req.body);

    const tpl = await loadTemplate(id);
    if (!tpl) return reply.notFound('Template not found');

    const kind = body.kind ?? tpl.targetKind ?? 'note';

    const [created] = await db
      .insert(notes)
      .values({
        title: body.title,
        kind,
        content: '', // body comes from template merge below
        contentJson: null,
        tags: [],
        folderId: body.folderId ?? null,
      })
      .returning();

    // Use the application service to apply body + properties + defaults
    // in one transaction. `replace-empty-only` keeps the brand-new note
    // body in sync with the template body without ever clobbering user
    // input (impossible here anyway since the note was just created).
    const options: TemplateApplicationOptions = {
      contentPlacement: 'replace-empty-only',
      mergeTags: true,
      applyDefaults: true,
      ...(body.options ?? {}),
    };
    const result = await applyTemplate(created, tpl, options);

    const [refreshed] = await db
      .select()
      .from(notes)
      .where(eq(notes.id, created.id))
      .limit(1);
    return { note: refreshed, application: result };
  });

  // ───────────── Preview an apply against an existing note ─────────────
  app.post('/notes/:noteId/template-preview', async (req, reply) => {
    const { noteId } = noteIdParamSchema.parse(req.params);
    const body = applyTemplateSchema.parse(req.body);

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    const tpl = await loadTemplate(body.templateId);
    if (!tpl) return reply.notFound('Template not found');

    return previewTemplateApplication(note, tpl, body.options);
  });

  // ───────────── Apply against an existing note ─────────────
  app.post('/notes/:noteId/apply-template', async (req, reply) => {
    const { noteId } = noteIdParamSchema.parse(req.params);
    const body = applyTemplateSchema.parse(req.body);

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    if (note.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before applying a template.',
      });
    }
    const tpl = await loadTemplate(body.templateId);
    if (!tpl) return reply.notFound('Template not found');

    return applyTemplate(note, tpl, body.options);
  });
};

/**
 * Computed / button properties never carry a stored value, so a snapshot
 * captured from a note must not propagate one into the template.
 */
function sanitizeDefault(
  type: PropertyType,
  value: PropertyValue | null,
): PropertyValue | null {
  if (value === null) return null;
  if (type === 'button' || isComputedPropertyType(type)) return null;
  return value;
}
