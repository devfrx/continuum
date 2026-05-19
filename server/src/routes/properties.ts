/**
 * Custom Properties REST API.
 *
 *  Definitions — per note (default UI path)
 *  ───────────────────────────────────────
 *  POST   /api/notes/:noteId/properties           create a note-scoped definition
 *  POST   /api/notes/:noteId/properties/reorder   persist the note's definition order
 *
 *  Definitions — per kind (reserved for future Templates feature)
 *  ──────────────────────────────────────────────────────────────
 *  GET    /api/kinds/:kindId/properties           list definitions for a kind
 *  POST   /api/kinds/:kindId/properties           create a kind-scoped definition
 *  POST   /api/kinds/:kindId/properties/reorder   persist the kind's definition order
 *
 *  Definitions — generic
 *  ─────────────────────
 *  PATCH  /api/properties/:id                     update a definition (label, type, icon, description, config, position)
 *  DELETE /api/properties/:id                     delete a definition (cascades values)
 *
 *  Values (per-note)
 *  ─────────────────
 *  GET    /api/notes/:noteId/properties           list every property for the note + current values
 *  PUT    /api/notes/:noteId/properties/:propId   set / update a single value (DELETE-when-empty semantics)
 *  DELETE /api/notes/:noteId/properties/:propId   clear a value
 *
 *  Filter (future kanban view)
 *  ──────────────────────────
 *  See `routes/graph.ts` (POST /api/graph/query) and `routes/query.ts`
 *  (GET /api/query/fields) for the live filter execution + field
 *  catalogue endpoints.
 *
 * The routes are mounted with a generic `/api` prefix in `index.ts`.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  databases,
  kinds,
  notes,
  propertyDefinitions,
  propertyValues,
  type NoteRow,
  type PropertyDefinitionRow,
} from '../db/schema.js';
import { slugify } from '../lib/slugify.js';
import {
  configSchemaFor,
  definitionRowToDto,
  isComputedPropertyType,
  propertyTypeSchema,
  valueDtoToRow,
  valueRowToDto,
  valueSchemaFor,
} from '../services/properties.js';
import {
  executeButtonAction,
  listNoteDatabaseMemberships,
  resolveNotePropertiesResponse,
} from '../services/property-computed.js';
import { createDatabaseProperty } from '../services/databases.js';
import type {
  ButtonConfig,
  NotePropertiesResponse,
  PropertyType,
} from '@continuum/shared';

// ───────────────────────────── Schemas ─────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });
const noteIdParamSchema = z.object({ noteId: z.string().uuid() });
const notePropParamSchema = z.object({
  noteId: z.string().uuid(),
  propId: z.string().uuid(),
});
const kindIdParamSchema = z.object({ kindId: z.string().min(1).max(60) });

const createDefinitionSchema = z.object({
  key: z.string().min(1).max(60).optional(),
  label: z.string().min(1).max(60),
  type: propertyTypeSchema,
  icon: z.string().min(1).max(60).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.unknown().optional(),
  position: z.string().max(120).optional(),
});

/**
 * Per-note create accepts an optional routing hint. When the note is a
 * row of one or more databases the property is created on the shared
 * schema instead of the note's private schema:
 *
 *   – `databaseId` present → create on that database explicitly.
 *   – omitted + note has exactly one membership → create on it.
 *   – omitted + note has multiple memberships → 400; client must pick.
 *   – `private: true` always forces the legacy per-note path.
 */
const createNoteDefinitionSchema = createDefinitionSchema.extend({
  databaseId: z.string().uuid().optional(),
  private: z.boolean().optional(),
});

const updateDefinitionSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  type: propertyTypeSchema.optional(),
  icon: z.string().min(1).max(60).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  config: z.unknown().optional(),
  position: z.string().max(120).optional(),
});

const reorderDefinitionsSchema = z.object({
  /** Complete ordered list of definition ids for the kind. */
  ids: z.array(z.string().uuid()).max(500),
});

// ───────────────────────────── Helpers ─────────────────────────────────

/** Find the next LexoRank-style position string for an owner (lexicographic). */
async function nextPositionForKind(kindId: string | null): Promise<string> {
  const where = kindId === null
    ? isNull(propertyDefinitions.kindId)
    : eq(propertyDefinitions.kindId, kindId);
  const rows = await db
    .select({ position: propertyDefinitions.position })
    .from(propertyDefinitions)
    .where(where)
    .orderBy(asc(propertyDefinitions.position));
  if (rows.length === 0) return 'a0';
  return `${rows[rows.length - 1].position}m`;
}

async function nextPositionForNote(noteId: string): Promise<string> {
  const rows = await db
    .select({ position: propertyDefinitions.position })
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.noteId, noteId))
    .orderBy(asc(propertyDefinitions.position));
  if (rows.length === 0) return 'a0';
  return `${rows[rows.length - 1].position}m`;
}

/**
 * Guard every value-level operation with the effective-schema contract:
 * private definitions must belong to the note, database definitions must
 * belong to a database row membership, kind definitions must match the
 * note kind, and globals apply everywhere.
 */
async function definitionAppliesToNote(
  defRow: PropertyDefinitionRow,
  note: NoteRow,
): Promise<boolean> {
  if (defRow.scope === 'note') return defRow.noteId === note.id;
  if (defRow.scope === 'kind') return defRow.kindId === note.kind;
  if (defRow.scope === 'global') return true;
  if (defRow.scope === 'database') {
    if (!defRow.databaseId) return false;
    const memberships = await listNoteDatabaseMemberships(note.id);
    return memberships.includes(defRow.databaseId);
  }
  return false;
}

/**
 * Block any value-level mutation on a shared (database-scoped)
 * property whose owning database is locked. Mirrors the note-level
 * `note.locked` guard already present on every mutating route — same
 * 423 status code, with a stable machine-readable `error:
 * 'database-locked'` payload so the client can surface a consistent
 * message. Returns `true` when the route should abort.
 */
async function rejectIfDatabaseLocked(
  defRow: PropertyDefinitionRow,
  reply: import('fastify').FastifyReply,
): Promise<boolean> {
  if (defRow.scope !== 'database' || !defRow.databaseId) return false;
  const [dbRow] = await db
    .select({ locked: databases.locked })
    .from(databases)
    .where(eq(databases.id, defRow.databaseId))
    .limit(1);
  if (dbRow?.locked) {
    reply.code(423).send({
      error: 'database-locked',
      message: 'Database is locked. Unlock it before editing this property.',
    });
    return true;
  }
  return false;
}

/** Normalised lexicographic rank used when a kind's properties are reordered. */
function positionForIndex(index: number): string {
  return `p${String((index + 1) * 1000).padStart(8, '0')}`;
}

// ─────────────────────────── Plugin export ─────────────────────────────

export const propertyRoutes: FastifyPluginAsync = async (app) => {
  // ───────────── Definitions: list per kind ─────────────
  app.get('/kinds/:kindId/properties', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    const [kind] = await db.select().from(kinds).where(eq(kinds.id, kindId)).limit(1);
    if (!kind) return reply.notFound(`Kind "${kindId}" not found`);

    const rows = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.kindId, kindId))
      .orderBy(asc(propertyDefinitions.position));
    return rows.map(definitionRowToDto);
  });

  // ───────────── Definitions: create per kind ─────────────
  app.post('/kinds/:kindId/properties', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    const body = createDefinitionSchema.parse(req.body);

    const [kind] = await db.select().from(kinds).where(eq(kinds.id, kindId)).limit(1);
    if (!kind) return reply.notFound(`Kind "${kindId}" not found`);

    const key = body.key?.trim() ? slugify(body.key, 60) : slugify(body.label, 60);
    if (!key) return reply.badRequest('Could not derive a valid key from the label');

    const [existing] = await db
      .select()
      .from(propertyDefinitions)
      .where(
        and(eq(propertyDefinitions.kindId, kindId), eq(propertyDefinitions.key, key)),
      )
      .limit(1);
    if (existing) return reply.conflict(`A property with key "${key}" already exists for this kind`);

    // Validate the config payload against the type. When omitted, default
    // to `{ type }` so the type-specific defaults are applied client-side.
    const configParser = configSchemaFor(body.type);
    const config = configParser.parse(body.config ?? { type: body.type });

    const position = body.position ?? (await nextPositionForKind(kindId));

    const [created] = await db
      .insert(propertyDefinitions)
      .values({
        scope: 'kind',
        kindId,
        noteId: null,
        databaseId: null,
        key,
        label: body.label,
        type: body.type,
        icon: body.icon ?? null,
        description: body.description ?? null,
        config,
        position,
      })
      .returning();
    return definitionRowToDto(created);
  });

  // ───────────── Definitions: reorder per kind ─────────────
  app.post('/kinds/:kindId/properties/reorder', async (req, reply) => {
    const { kindId } = kindIdParamSchema.parse(req.params);
    const body = reorderDefinitionsSchema.parse(req.body);

    const [kind] = await db.select().from(kinds).where(eq(kinds.id, kindId)).limit(1);
    if (!kind) return reply.notFound(`Kind "${kindId}" not found`);

    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      return reply.badRequest('Duplicate property ids in reorder payload');
    }

    const existing = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.kindId, kindId))
      .orderBy(asc(propertyDefinitions.position));

    const existingIds = new Set(existing.map((row) => row.id));
    const payloadMatchesKind = body.ids.length === existing.length
      && body.ids.every((id) => existingIds.has(id));
    if (!payloadMatchesKind) {
      return reply.badRequest(
        'Reorder payload must include every property for this kind exactly once',
      );
    }

    const updated = await db.transaction(async (tx) => {
      for (const [index, id] of body.ids.entries()) {
        await tx
          .update(propertyDefinitions)
          .set({ position: positionForIndex(index), updatedAt: new Date() })
          .where(eq(propertyDefinitions.id, id));
      }
      return tx
        .select()
        .from(propertyDefinitions)
        .where(eq(propertyDefinitions.kindId, kindId))
        .orderBy(asc(propertyDefinitions.position));
    });

    return updated.map(definitionRowToDto);
  });

  // ───────────── Definitions: create per note ─────────────
  // POST /api/notes/:noteId/properties
  // The default code path used by the inline property panel: each note
  // owns its own schema, so adding a property here never leaks to its
  // siblings. Kind-scoped definitions remain available for the future
  // Templates feature but are not auto-applied.
  app.post('/notes/:noteId/properties', async (req, reply) => {
    const { noteId } = noteIdParamSchema.parse(req.params);
    const body = createNoteDefinitionSchema.parse(req.body);

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    if (note.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before editing properties.',
      });
    }

    const key = body.key?.trim() ? slugify(body.key, 60) : slugify(body.label, 60);
    if (!key) return reply.badRequest('Could not derive a valid key from the label');

    const configParser = configSchemaFor(body.type);
    const config = configParser.parse(body.config ?? { type: body.type });

    // ── Route the create to the right schema ────────────────────────
    // The note may be standalone (→ private) or a row of one or more
    // databases (→ shared). The client can force `private: true` to keep
    // the property local even when the note has memberships.
    const memberships = body.private ? [] : await listNoteDatabaseMemberships(noteId);
    const explicitDb = body.databaseId ?? null;
    if (explicitDb && !memberships.includes(explicitDb)) {
      return reply.badRequest('Note is not a row of the supplied database');
    }
    let targetDatabaseId: string | null = null;
    if (explicitDb) targetDatabaseId = explicitDb;
    else if (memberships.length === 1) targetDatabaseId = memberships[0];
    else if (memberships.length > 1) {
      return reply.badRequest(
        'Note belongs to multiple databases. Specify `databaseId` or set `private: true`.',
      );
    }

    if (targetDatabaseId) {
      // Shared schema path — reuse the canonical database property creator
      // so collision / position / DTO shaping stays in one place.
      const [database] = await db
        .select()
        .from(databases)
        .where(eq(databases.id, targetDatabaseId))
        .limit(1);
      if (!database) return reply.notFound('Database not found');

      const [collision] = await db
        .select()
        .from(propertyDefinitions)
        .where(
          and(
            eq(propertyDefinitions.databaseId, targetDatabaseId),
            eq(propertyDefinitions.key, key),
          ),
        )
        .limit(1);
      if (collision) {
        return reply.conflict(
          `A property with key "${key}" already exists on this database`,
        );
      }

      const [targetDb] = await db
        .select({ locked: databases.locked })
        .from(databases)
        .where(eq(databases.id, targetDatabaseId))
        .limit(1);
      if (targetDb?.locked) {
        return reply.code(423).send({
          error: 'database-locked',
          message: 'Database is locked. Unlock it before adding properties.',
        });
      }

      const created = await createDatabaseProperty(targetDatabaseId, {
        key,
        label: body.label,
        type: body.type,
        icon: body.icon ?? null,
        description: body.description ?? null,
        config,
        position: body.position,
      });
      return definitionRowToDto(created);
    }

    // Private schema path — note keeps its own definition.
    const [existing] = await db
      .select()
      .from(propertyDefinitions)
      .where(
        and(eq(propertyDefinitions.noteId, noteId), eq(propertyDefinitions.key, key)),
      )
      .limit(1);
    if (existing) return reply.conflict(`A property with key "${key}" already exists on this note`);

    const position = body.position ?? (await nextPositionForNote(noteId));

    const [created] = await db
      .insert(propertyDefinitions)
      .values({
        scope: 'note',
        kindId: null,
        noteId,
        databaseId: null,
        key,
        label: body.label,
        type: body.type,
        icon: body.icon ?? null,
        description: body.description ?? null,
        config,
        position,
      })
      .returning();
    return definitionRowToDto(created);
  });

  // ───────────── Definitions: reorder per note ─────────────
  app.post('/notes/:noteId/properties/reorder', async (req, reply) => {
    const { noteId } = noteIdParamSchema.parse(req.params);
    const body = reorderDefinitionsSchema.parse(req.body);

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');

    const uniqueIds = new Set(body.ids);
    if (uniqueIds.size !== body.ids.length) {
      return reply.badRequest('Duplicate property ids in reorder payload');
    }

    const existing = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.noteId, noteId))
      .orderBy(asc(propertyDefinitions.position));

    const existingIds = new Set(existing.map((row) => row.id));
    const payloadMatches = body.ids.length === existing.length
      && body.ids.every((id) => existingIds.has(id));
    if (!payloadMatches) {
      return reply.badRequest(
        'Reorder payload must include every property for this note exactly once',
      );
    }

    const updated = await db.transaction(async (tx) => {
      for (const [index, id] of body.ids.entries()) {
        await tx
          .update(propertyDefinitions)
          .set({ position: positionForIndex(index), updatedAt: new Date() })
          .where(eq(propertyDefinitions.id, id));
      }
      return tx
        .select()
        .from(propertyDefinitions)
        .where(eq(propertyDefinitions.noteId, noteId))
        .orderBy(asc(propertyDefinitions.position));
    });

    return updated.map(definitionRowToDto);
  });

  // ───────────── Definitions: patch ─────────────
  app.patch('/properties/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updateDefinitionSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.id, id))
      .limit(1);
    if (!existing) return reply.notFound('Property not found');
    if (await rejectIfDatabaseLocked(existing, reply)) return;

    const patch: Partial<PropertyDefinitionRow> = { updatedAt: new Date() };
    if (body.label !== undefined) patch.label = body.label;
    if (body.icon !== undefined) patch.icon = body.icon;
    if (body.description !== undefined) patch.description = body.description;
    if (body.position !== undefined) patch.position = body.position;
    const existingType = existing.type as PropertyType;
    const nextType = body.type ?? existingType;
    const typeChanged = nextType !== existingType;

    if (body.type !== undefined) patch.type = nextType;
    if (body.config !== undefined || typeChanged) {
      const parser = configSchemaFor(nextType);
      patch.config = parser.parse(body.config ?? { type: nextType });
    }

    const [updated] = await db.transaction(async (tx) => {
      if (typeChanged) {
        await tx.delete(propertyValues).where(eq(propertyValues.propertyId, id));
      }
      return tx
        .update(propertyDefinitions)
        .set(patch)
        .where(eq(propertyDefinitions.id, id))
        .returning();
    });
    return definitionRowToDto(updated);
  });

  // ───────────── Definitions: delete ─────────────
  app.delete('/properties/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [existing] = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.id, id))
      .limit(1);
    if (!existing) return reply.notFound('Property not found');
    if (await rejectIfDatabaseLocked(existing, reply)) return;

    // FK ON DELETE CASCADE removes all property_values rows.
    await db.delete(propertyDefinitions).where(eq(propertyDefinitions.id, id));
    return { ok: true };
  });

  // ───────────── Values: list per note ─────────────
  // Returns the note's *effective* schema (private + every database it
  // belongs to) plus the membership ids so the client can subscribe to
  // shared-schema realtime events.
  app.get('/notes/:noteId/properties', async (req, reply) => {
    const { noteId } = noteIdParamSchema.parse(req.params);
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    return resolveNotePropertiesResponse(noteId) satisfies Promise<NotePropertiesResponse>;
  });

  // ───────────── Values: PUT (upsert / clear-when-empty) ─────────────
  app.put('/notes/:noteId/properties/:propId', async (req, reply) => {
    const { noteId, propId } = notePropParamSchema.parse(req.params);

    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    if (note.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before editing properties.',
      });
    }
    const [defRow] = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.id, propId))
      .limit(1);
    if (!defRow) return reply.notFound('Property not found');
    if (!(await definitionAppliesToNote(defRow, note))) {
      return reply.badRequest('Property does not belong to this note');
    }
    if (await rejectIfDatabaseLocked(defRow, reply)) return;
    if (defRow.type === 'button' || isComputedPropertyType(defRow.type as PropertyType)) {
      return reply.badRequest(
        `Cannot set value for '${defRow.type}': this property is auto-managed.`,
      );
    }

    const def = definitionRowToDto(defRow);
    const parser = valueSchemaFor(def);
    const value = parser.parse(req.body);
    const encoded = valueDtoToRow(value);

    if (encoded === null) {
      // Empty value → delete the row entirely (sparse storage).
      await db
        .delete(propertyValues)
        .where(
          and(eq(propertyValues.noteId, noteId), eq(propertyValues.propertyId, propId)),
        );
      return { ok: true, value: null };
    }

    // Upsert via INSERT … ON CONFLICT DO UPDATE on (note_id, property_id).
    const [row] = await db
      .insert(propertyValues)
      .values({
        noteId,
        propertyId: propId,
        ...encoded,
      })
      .onConflictDoUpdate({
        target: [propertyValues.noteId, propertyValues.propertyId],
        set: { ...encoded, updatedAt: new Date() },
      })
      .returning();

    return { ok: true, value: valueRowToDto(row, def.type) };
  });

  // ───────────── Values: clear ─────────────
  app.delete('/notes/:noteId/properties/:propId', async (req, reply) => {
    const { noteId, propId } = notePropParamSchema.parse(req.params);
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    if (note.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before editing properties.',
      });
    }
    const [defRow] = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.id, propId))
      .limit(1);
    if (!defRow) return reply.notFound('Property not found');
    if (!(await definitionAppliesToNote(defRow, note))) {
      return reply.badRequest('Property does not belong to this note');
    }
    if (await rejectIfDatabaseLocked(defRow, reply)) return;
    if (defRow && (defRow.type === 'button' || isComputedPropertyType(defRow.type as PropertyType))) {
      return reply.badRequest(
        `Cannot clear value for '${defRow.type}': this property is auto-managed.`,
      );
    }
    await db
      .delete(propertyValues)
      .where(
        and(eq(propertyValues.noteId, noteId), eq(propertyValues.propertyId, propId)),
      );
    return { ok: true };
  });

  // ───────────── Values: trigger button action ─────────────
  // POST /api/notes/:noteId/properties/:propId/run
  // Runs the action declared in a button property's config and returns the
  // updated target value (when the action mutates a property server-side).
  app.post('/notes/:noteId/properties/:propId/run', async (req, reply) => {
    const { noteId, propId } = notePropParamSchema.parse(req.params);
    const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
    if (!note) return reply.notFound('Note not found');
    if (note.locked) {
      return reply.code(423).send({
        error: 'note-locked',
        message: 'Note is locked. Unlock it before running button actions.',
      });
    }
    const [defRow] = await db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.id, propId))
      .limit(1);
    if (!defRow) return reply.notFound('Property not found');
    if (!(await definitionAppliesToNote(defRow, note))) {
      return reply.badRequest('Property does not belong to this note');
    }
    if (await rejectIfDatabaseLocked(defRow, reply)) return;
    if (defRow.type !== 'button') {
      return reply.badRequest('Property is not a button');
    }
    const cfg = defRow.config as ButtonConfig;
    try {
      const result = await executeButtonAction(noteId, cfg.action);
      return { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'button-failed';
      return reply.badRequest(message);
    }
  });
};
