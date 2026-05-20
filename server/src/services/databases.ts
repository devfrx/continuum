/**
 * Notion-like Database service.
 *
 * Orchestrates the three resources that make up a Database (a.k.a.
 * "datasource"):
 *   1. The database itself (`databases`),
 *   2. Schema — property definitions with `scope='database'`,
 *   3. Rows — membership rows in `database_rows`, each pointing at a
 *      `notes` entry that carries the row's content and property values.
 *
 * Saved views live block-scoped in `database_block_views` and are
 * managed by the `blockViews` service. A datasource is a pure row
 * source — it knows nothing about which blocks render it.
 *
 * Reuse is intentional: rows are real notes, so titles / locks / tags /
 * links / graph / templates all keep working without database-aware
 * branches in those subsystems. Schema reuses `property_definitions`
 * (and therefore the entire validation, computed-types and rollup
 * pipeline). The only database-specific glue lives here.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  databases,
  databaseRows,
  notes,
  propertyDefinitions,
  propertyValues,
  type DatabaseRowEntity,
  type DatabaseMembershipRow,
  type PropertyDefinitionRow,
} from '../db/schema.js';
import {
  EMPTY_DATABASE_VIEW_CONFIG,
  type Database,
  type DatabaseBundle,
  type DatabaseQueryRequest,
  type DatabaseQueryResponse,
  type DatabaseRow,
  type DatabaseRowSnapshot,
  type DatabaseViewConfig,
  type NoteProperty,
  type PropertyConfig,
  type PropertyDefinition,
  type PropertyMergeCollision,
  type PropertyMergePreview,
  type PropertyMergeResolveInput,
  type PropertyOption,
  type PropertyType,
  type SortRule,
  type StatusConfig,
  type StatusOption,
  type UUID,
} from '@continuum/shared';
import { definitionRowToDto } from './properties.js';
import { resolveFromPrefetched } from './property-computed.js';

const ROW_LIMIT_MAX = 200;
const ROW_LIMIT_DEFAULT = 50;

// ─────────────────────────── Row mappers ───────────────────────────────

export function databaseRowToDto(row: DatabaseRowEntity): Database {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    icon: row.icon,
    locked: row.locked,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function membershipRowToDto(row: DatabaseMembershipRow): DatabaseRow {
  return {
    id: row.id,
    databaseId: row.databaseId,
    noteId: row.noteId,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Coerce a stored `config` jsonb into a fully-shaped `DatabaseViewConfig`.
 * Missing keys fall back to the canonical empty config so old rows keep
 * rendering when the shape grows. Exported so the block-views service
 * can apply the same canonical shape on insert/update.
 */
export function normalizeViewConfig(raw: unknown): DatabaseViewConfig {
  const base = EMPTY_DATABASE_VIEW_CONFIG;
  if (!raw || typeof raw !== 'object') return { ...base };
  const obj = raw as Partial<DatabaseViewConfig>;
  return {
    filter: obj.filter ?? base.filter,
    sort: Array.isArray(obj.sort) ? obj.sort : base.sort,
    group: obj.group ?? null,
    visibleProperties: obj.visibleProperties ?? null,
    hiddenProperties: Array.isArray(obj.hiddenProperties) ? obj.hiddenProperties : [],
    conditionalColors: Array.isArray(obj.conditionalColors) ? obj.conditionalColors : [],
    layout: obj.layout ?? null,
  };
}

// ─────────────────────────── LexoRank helpers ──────────────────────────

/** Cheap append helper: takes the lexicographically-last position and
 *  appends `'m'`, mirroring the heuristic used by per-note properties. */
function appendPosition(last: string | null): string {
  return last ? `${last}m` : 'a0';
}

function uniquePrivateKey(baseKey: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(baseKey)) {
    usedKeys.add(baseKey);
    return baseKey;
  }
  const root = baseKey.slice(0, 54) || 'property';
  let suffix = 2;
  let candidate = `${root}_${suffix}`;
  while (usedKeys.has(candidate)) {
    suffix += 1;
    candidate = `${root}_${suffix}`;
  }
  usedKeys.add(candidate);
  return candidate;
}

async function nextRowPosition(databaseId: UUID): Promise<string> {
  const rows = await db
    .select({ position: databaseRows.position })
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .orderBy(asc(databaseRows.position));
  return appendPosition(rows.length ? rows[rows.length - 1].position : null);
}

async function nextSchemaPosition(databaseId: UUID): Promise<string> {
  const rows = await db
    .select({ position: propertyDefinitions.position })
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.databaseId, databaseId))
    .orderBy(asc(propertyDefinitions.position));
  return appendPosition(rows.length ? rows[rows.length - 1].position : null);
}

/**
 * Position for a brand-new private (scope='note') definition. Mirrors
 * `nextSchemaPosition` but scoped to a single note. Used by the leave-db
 * promotion path so demoted shared properties join the tail of the
 * note's private schema.
 */
async function nextPrivateDefinitionPosition(noteId: UUID): Promise<string> {
  const rows = await db
    .select({ position: propertyDefinitions.position })
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.noteId, noteId))
    .orderBy(asc(propertyDefinitions.position));
  return appendPosition(rows.length ? rows[rows.length - 1].position : null);
}

// ─────────────────────────── Public API ────────────────────────────────

/** Fetch a single database by id, or `null` when missing. */
export async function getDatabaseById(id: UUID): Promise<DatabaseRowEntity | null> {
  const [row] = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
  return row ?? null;
}

/** Bundle returned by `loadDatabaseBundle` — used by the editor on mount. */
export type { DatabaseBundle };

/**
 * Single round-trip helper: load the datasource metadata + its property
 * schema. Used by both the global manager and any block view loading
 * the datasource it points at. Block-scoped views are NOT part of this
 * bundle — see `services/blockViews.ts` for that namespace.
 */
export async function loadDatabaseBundle(id: UUID): Promise<DatabaseBundle | null> {
  const dbRow = await getDatabaseById(id);
  if (!dbRow) return null;
  const defRows = await db
    .select()
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.databaseId, id))
    .orderBy(asc(propertyDefinitions.position));
  return {
    database: databaseRowToDto(dbRow),
    schema: defRows.map(definitionRowToDto),
  };
}

// ─────────────────────────── Create ────────────────────────────────────

export async function createDatabase(input: {
  title?: string;
  description?: string | null;
  icon?: string | null;
}): Promise<{ database: Database }> {
  const [created] = await db
    .insert(databases)
    .values({
      title: input.title ?? '',
      description: input.description ?? null,
      icon: input.icon ?? null,
    })
    .returning();
  return { database: databaseRowToDto(created) };
}

export async function updateDatabase(
  id: UUID,
  patch: Partial<{
    title: string;
    description: string | null;
    icon: string | null;
    locked: boolean;
    archived: boolean;
  }>,
): Promise<Database | null> {
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.icon !== undefined) fields.icon = patch.icon;
  if (patch.locked !== undefined) fields.locked = patch.locked;
  if (patch.archived !== undefined) fields.archived = patch.archived;
  const [updated] = await db
    .update(databases)
    .set(fields)
    .where(eq(databases.id, id))
    .returning();
  return updated ? databaseRowToDto(updated) : null;
}

export async function deleteDatabase(id: UUID): Promise<void> {
  // FK cascades wipe rows and database-scoped property definitions; the
  // `database_block_views` table also cascades via
  // `data_source_database_id`, removing any block view that pointed at
  // this datasource. The underlying notes are intentionally preserved —
  // deleting a database unbinds its rows but does not delete user
  // content. Callers that want to also delete the row notes must do so
  // explicitly before removal.
  await db.delete(databases).where(eq(databases.id, id));
}

// `appendPosition` is shared with the block-views service.
export { appendPosition };

// ─────────────────────────── Schema ────────────────────────────────────

export interface CreateDatabasePropertyInput {
  key: string;
  label: string;
  type: PropertyType;
  icon?: string | null;
  description?: string | null;
  config: PropertyConfig;
  position?: string;
}

export async function createDatabaseProperty(
  databaseId: UUID,
  input: CreateDatabasePropertyInput,
): Promise<PropertyDefinitionRow> {
  const position = input.position ?? (await nextSchemaPosition(databaseId));
  const [row] = await db
    .insert(propertyDefinitions)
    .values({
      scope: 'database',
      kindId: null,
      noteId: null,
      databaseId,
      key: input.key,
      label: input.label,
      type: input.type,
      icon: input.icon ?? null,
      description: input.description ?? null,
      config: input.config,
      position,
    })
    .returning();
  return row;
}

// ─────────────────────────── Rows ──────────────────────────────────────

/**
 * Create a new row. When `noteId` is omitted, a fresh note is created
 * under the database's default kind (`'note'`). Otherwise the supplied
 * note is linked into the database — useful for "Link existing note".
 */
export async function createRow(
  databaseId: UUID,
  input: { noteId?: UUID; title?: string; position?: string },
): Promise<{ row: DatabaseRow; noteId: UUID }> {
  const position = input.position ?? (await nextRowPosition(databaseId));

  let noteId = input.noteId;
  if (!noteId) {
    const [createdNote] = await db
      .insert(notes)
      .values({
        title: input.title?.trim() || 'Untitled',
        kind: 'note',
        content: '',
        tags: [],
      })
      .returning({ id: notes.id });
    noteId = createdNote.id;
  }

  const [row] = await db
    .insert(databaseRows)
    .values({ databaseId, noteId, position })
    .onConflictDoNothing({
      target: [databaseRows.databaseId, databaseRows.noteId],
    })
    .returning();

  if (!row) {
    // Conflict — fetch the existing membership so callers always get a row back.
    const [existing] = await db
      .select()
      .from(databaseRows)
      .where(
        and(
          eq(databaseRows.databaseId, databaseId),
          eq(databaseRows.noteId, noteId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error('database-row-create-failed');
    return { row: membershipRowToDto(existing), noteId };
  }
  return { row: membershipRowToDto(row), noteId };
}

// ─────────────────────── Link merge (preview/resolve) ─────────────────

/**
 * Compute the merge preview for linking `noteId` into `databaseId`:
 *
 *  - `autoInherited` — shared defs the note doesn't have a private copy
 *    of. The note silently inherits them on link, no user action needed.
 *  - `autoPromoted` — private defs whose key doesn't exist in the shared
 *    schema. We promote them to scope='database' so the new schema is
 *    the union; existing rows inherit them with no value set.
 *  - `collisions` — same key on both sides. Caller must pick an action.
 *    When types match we suggest `merge`; otherwise `rename`.
 */
export async function previewLinkMerge(
  databaseId: UUID,
  noteId: UUID,
): Promise<PropertyMergePreview> {
  const [privateDefs, sharedDefs] = await Promise.all([
    db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.noteId, noteId))
      .orderBy(asc(propertyDefinitions.position)),
    db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, databaseId))
      .orderBy(asc(propertyDefinitions.position)),
  ]);

  const privateByKey = new Map(privateDefs.map((d) => [d.key, d] as const));
  const sharedByKey = new Map(sharedDefs.map((d) => [d.key, d] as const));

  const autoInherited: PropertyDefinition[] = [];
  for (const shared of sharedDefs) {
    if (!privateByKey.has(shared.key)) autoInherited.push(definitionRowToDto(shared));
  }

  const autoPromoted: PropertyDefinition[] = [];
  const collisions: PropertyMergeCollision[] = [];
  for (const priv of privateDefs) {
    const shared = sharedByKey.get(priv.key);
    if (!shared) {
      autoPromoted.push(definitionRowToDto(priv));
      continue;
    }
    const compatible = priv.type === shared.type;
    collisions.push({
      key: priv.key,
      private: definitionRowToDto(priv),
      shared: definitionRowToDto(shared),
      compatible,
      suggested: compatible ? 'merge' : 'rename',
    });
  }

  return { autoPromoted, autoInherited, collisions };
}

/**
 * Apply a merge resolution and create the membership row. All steps run
 * in a single transaction so partial schemas can't escape.
 *
 * Resolution semantics:
 *  - `merge`   — only valid when types match. Move every value from the
 *                private definition onto the shared one, union select
 *                options when relevant, then delete the private def.
 *  - `rename`  — promote the private def to scope='database' under a new
 *                key/label so it lives alongside the existing shared
 *                definition.
 *  - `keepPrivate` — leave the private def alone. The note will carry
 *                both a private and a shared property with the same key
 *                being shadowed; effective resolution honours scope
 *                priority in `resolveNoteProperties`.
 *
 * `autoPromoted` defs (no collision) are always promoted; they cannot be
 * downgraded by the caller because there's no conflicting decision.
 */
export async function resolveLinkMerge(
  databaseId: UUID,
  input: PropertyMergeResolveInput,
): Promise<{ row: DatabaseRow; noteId: UUID }> {
  const { noteId } = input;
  const preview = await previewLinkMerge(databaseId, noteId);

  // Reject if the caller hasn't picked an action for every collision.
  const resolutionByKey = new Map(input.resolutions.map((r) => [r.key, r] as const));
  for (const collision of preview.collisions) {
    if (!resolutionByKey.has(collision.key)) {
      throw new Error(`merge-resolution-missing:${collision.key}`);
    }
  }
  // Reject 'merge' on incompatible types — the UI should disable this
  // already, but trust nothing the client sends.
  for (const collision of preview.collisions) {
    const decision = resolutionByKey.get(collision.key)!;
    if (decision.action === 'merge' && !collision.compatible) {
      throw new Error(`merge-incompatible-types:${collision.key}`);
    }
  }

  return await db.transaction(async (tx) => {
    // Cursor used by every promotion path so positions stay monotonic
    // inside this transaction. We seed from the live schema and bump
    // locally; the next outside call to `nextSchemaPosition` will pick
    // up from the persisted tail anyway.
    const tailRows = await tx
      .select({ position: propertyDefinitions.position })
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, databaseId))
      .orderBy(asc(propertyDefinitions.position));
    let positionCursor = appendPosition(
      tailRows.length ? tailRows[tailRows.length - 1].position : null,
    );
    const nextPosition = (): string => {
      const out = positionCursor;
      positionCursor = `${positionCursor}m`;
      return out;
    };

    // ── 1. Auto-promote private defs that have no shared counterpart.
    for (const def of preview.autoPromoted) {
      await tx
        .update(propertyDefinitions)
        .set({
          scope: 'database',
          noteId: null,
          databaseId,
          position: nextPosition(),
          updatedAt: new Date(),
        })
        .where(eq(propertyDefinitions.id, def.id));
    }

    // ── 2. Process each collision per the caller's decision.
    for (const collision of preview.collisions) {
      const decision = resolutionByKey.get(collision.key)!;
      switch (decision.action) {
        case 'merge': {
          // Move every value from private → shared, union select options
          // can't already hold a value on the shared def (it isn't in
          // the database yet) — but we still guard with onConflict.
          await tx
            .update(propertyValues)
            .set({
              propertyId: collision.shared.id,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(propertyValues.noteId, noteId),
                eq(propertyValues.propertyId, collision.private.id),
              ),
            );
          const merged = mergeOptionsForPicker(
            collision.private.config,
            collision.shared.config,
            collision.shared.type,
          );
          if (merged) {
            await tx
              .update(propertyDefinitions)
              .set({ config: merged, updatedAt: new Date() })
              .where(eq(propertyDefinitions.id, collision.shared.id));
          }
          await tx
            .delete(propertyDefinitions)
            .where(eq(propertyDefinitions.id, collision.private.id));
          break;
        }
        case 'rename': {
          const rename = decision.renameTo;
          if (!rename || !rename.key || !rename.label) {
            throw new Error(`merge-rename-payload-missing:${collision.key}`);
          }
          // The new key must not clash with anything already in the
          // shared schema (sibling rename), so we re-check here.
          const [dup] = await tx
            .select()
            .from(propertyDefinitions)
            .where(
              and(
                eq(propertyDefinitions.databaseId, databaseId),
                eq(propertyDefinitions.key, rename.key),
              ),
            )
            .limit(1);
          if (dup) {
            throw new Error(`merge-rename-key-conflict:${rename.key}`);
          }
          await tx
            .update(propertyDefinitions)
            .set({
              scope: 'database',
              noteId: null,
              databaseId,
              key: rename.key,
              label: rename.label,
              position: nextPosition(),
              updatedAt: new Date(),
            })
            .where(eq(propertyDefinitions.id, collision.private.id));
          break;
        }
        case 'keepPrivate':
          // No-op — the private definition stays bound to the note.
          break;
        default:
          throw new Error(`merge-unknown-action:${(decision as { action: string }).action}`);
      }
    }

    // ── 3. Create the membership last so the schema is consistent
    //       before any view subscribers re-query.
    const position = input.position ?? (await nextRowPosition(databaseId));
    const [row] = await tx
      .insert(databaseRows)
      .values({ databaseId, noteId, position })
      .onConflictDoNothing({
        target: [databaseRows.databaseId, databaseRows.noteId],
      })
      .returning();
    if (!row) {
      const [existing] = await tx
        .select()
        .from(databaseRows)
        .where(
          and(
            eq(databaseRows.databaseId, databaseId),
            eq(databaseRows.noteId, noteId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error('database-row-create-failed');
      return { row: membershipRowToDto(existing), noteId };
    }
    return { row: membershipRowToDto(row), noteId };
  });
}

/**
 * Compute the unioned `config` for picker-style types (`select`,
 * `multiSelect`, `status`) when merging a private definition into a
 * shared one. Returns `null` for non-picker types — the shared config
 * stays as-is.
 *
 * Options are deduped by `id`; status options additionally preserve the
 * shared `group` / `defaultOptionId` so the pipeline metadata wins.
 */
function mergeOptionsForPicker(
  privateConfig: PropertyConfig,
  sharedConfig: PropertyConfig,
  type: PropertyType,
): PropertyConfig | null {
  if (type === 'select' || type === 'multiSelect') {
    const priv = privateConfig as { options?: PropertyOption[] };
    const shared = sharedConfig as { options?: PropertyOption[]; type: typeof type };
    const out = unionOptions(shared.options ?? [], priv.options ?? []);
    return { ...sharedConfig, type, options: out } as PropertyConfig;
  }
  if (type === 'status') {
    const priv = privateConfig as { options?: StatusOption[] };
    const shared = sharedConfig as StatusConfig;
    const out = unionStatusOptions(shared.options ?? [], priv.options ?? []);
    return { ...shared, options: out };
  }
  return null;
}

function unionOptions(base: PropertyOption[], extra: PropertyOption[]): PropertyOption[] {
  const seen = new Set(base.map((o) => o.id));
  const out = base.slice();
  for (const opt of extra) {
    if (seen.has(opt.id)) continue;
    seen.add(opt.id);
    out.push(opt);
  }
  return out;
}

function unionStatusOptions(
  base: StatusOption[],
  extra: StatusOption[],
): StatusOption[] {
  const seen = new Set(base.map((o) => o.id));
  const out = base.slice();
  for (const opt of extra) {
    if (seen.has(opt.id)) continue;
    seen.add(opt.id);
    out.push(opt);
  }
  return out;
}

export async function deleteRow(
  databaseId: UUID,
  rowId: UUID,
  options: { deleteNote: boolean },
): Promise<void> {
  const [row] = await db
    .select()
    .from(databaseRows)
    .where(and(eq(databaseRows.id, rowId), eq(databaseRows.databaseId, databaseId)))
    .limit(1);
  if (!row) return;
  // When the note is being deleted, FK cascades wipe both the row and
  // any property values it held — no promotion needed. We do everything
  // else inside a transaction so a half-promoted note never leaks.
  if (options.deleteNote) {
    await db.delete(databaseRows).where(eq(databaseRows.id, rowId));
    await db.delete(notes).where(eq(notes.id, row.noteId));
    return;
  }
  await db.transaction(async (tx) => {
    // 1. Gather every shared definition this note has a stored value for.
    //    These are the ones we must clone to private scope so the user
    //    doesn't silently lose data when the row leaves the database.
    const sharedDefs = await tx
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, databaseId));
    if (sharedDefs.length > 0) {
      const defIds = sharedDefs.map((d) => d.id);
      const heldValues = await tx
        .select()
        .from(propertyValues)
        .where(
          and(
            eq(propertyValues.noteId, row.noteId),
            inArray(propertyValues.propertyId, defIds),
          ),
        );
      if (heldValues.length > 0) {
        const sharedById = new Map(sharedDefs.map((d) => [d.id, d] as const));
        const existingPrivateDefs = await tx
          .select({ key: propertyDefinitions.key })
          .from(propertyDefinitions)
          .where(
            and(
              eq(propertyDefinitions.scope, 'note'),
              eq(propertyDefinitions.noteId, row.noteId),
            ),
          );
        const privateKeys = new Set(existingPrivateDefs.map((def) => def.key));
        // Position cursor: clone in deterministic order, appending each
        // new private def at the tail of the note's private schema.
        let cursor = await nextPrivateDefinitionPosition(row.noteId);
        for (const value of heldValues) {
          const shared = sharedById.get(value.propertyId);
          if (!shared) continue;
          const key = uniquePrivateKey(shared.key, privateKeys);
          const label = key === shared.key ? shared.label : `${shared.label} (database)`;
          const [cloned] = await tx
            .insert(propertyDefinitions)
            .values({
              scope: 'note',
              kindId: null,
              noteId: row.noteId,
              databaseId: null,
              key,
              label,
              type: shared.type,
              icon: shared.icon,
              description: shared.description,
              config: shared.config,
              position: cursor,
            })
            .returning({ id: propertyDefinitions.id });
          cursor = `${cursor}m`;
          await tx
            .update(propertyValues)
            .set({ propertyId: cloned.id, updatedAt: new Date() })
            .where(
              and(
                eq(propertyValues.noteId, row.noteId),
                eq(propertyValues.propertyId, value.propertyId),
              ),
            );
        }
      }
    }
    // 2. Drop the membership last so the cascade order is predictable.
    await tx.delete(databaseRows).where(eq(databaseRows.id, rowId));
  });
}

export async function reorderRows(
  databaseId: UUID,
  orderedRowIds: UUID[],
): Promise<void> {
  // Rewrite positions as evenly-spaced LexoRank slots so subsequent
  // single-row inserts stay cheap. Full-list payloads rewrite the whole
  // database; subset payloads (filtered/card views) reorder only the
  // slots currently occupied by those rows and preserve all other rows
  // in place.
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(databaseRows)
      .where(eq(databaseRows.databaseId, databaseId))
      .orderBy(asc(databaseRows.position));
    const byId = new Map(existing.map((row) => [row.id, row] as const));
    const incoming = orderedRowIds.map((id) => byId.get(id)).filter((row) => row !== undefined);
    const incomingIds = new Set(incoming.map((row) => row.id));
    const queue = [...incoming];
    const nextOrder = incoming.length === existing.length
      ? incoming
      : existing.map((row) => (incomingIds.has(row.id) ? queue.shift() ?? row : row));

    for (const [index, row] of nextOrder.entries()) {
      const position = `p${String((index + 1) * 1000).padStart(8, '0')}`;
      await tx
        .update(databaseRows)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(databaseRows.id, row.id), eq(databaseRows.databaseId, databaseId)));
    }
  });
}

// ─────────────────────────── Query ─────────────────────────────────────

/**
 * Resolve `(noteId → NoteProperty[])` using database-scoped definitions
 * only. Mirrors `resolveNotePropertiesBatch` but pulls defs by the
 * database id instead of the note id, so every row sees the same schema.
 */
async function resolveDatabaseRowProperties(
  databaseId: UUID,
  noteIds: UUID[],
): Promise<Map<UUID, NoteProperty[]>> {
  const out = new Map<UUID, NoteProperty[]>();
  if (noteIds.length === 0) return out;

  const [noteRows, defRows] = await Promise.all([
    db.select().from(notes).where(inArray(notes.id, noteIds)),
    db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, databaseId))
      .orderBy(asc(propertyDefinitions.position)),
  ]);
  const notesById = new Map(noteRows.map((n) => [n.id, n] as const));
  if (defRows.length === 0) {
    for (const id of noteIds) out.set(id, []);
    return out;
  }
  const defIds = defRows.map((d) => d.id);
  const valueRows = await db
    .select()
    .from(propertyValues)
    .where(
      and(
        inArray(propertyValues.noteId, noteIds),
        inArray(propertyValues.propertyId, defIds),
      ),
    );
  const valuesByNote = new Map<UUID, typeof valueRows>();
  for (const row of valueRows) {
    const arr = valuesByNote.get(row.noteId) ?? [];
    arr.push(row);
    valuesByNote.set(row.noteId, arr);
  }

  await Promise.all(
    noteIds.map(async (id) => {
      const note = notesById.get(id);
      if (!note) {
        out.set(id, []);
        return;
      }
      out.set(id, await resolveFromPrefetched(note, defRows, valuesByNote.get(id) ?? []));
    }),
  );
  return out;
}

/**
 * Compare two `NoteProperty` values for a sort rule. Falls back to
 * lexicographic on string-coercion so the table view stays stable across
 * heterogeneous property types.
 */
function compareForSort(a: NoteProperty | undefined, b: NoteProperty | undefined): number {
  const va = primitiveOfNoteProperty(a);
  const vb = primitiveOfNoteProperty(b);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb));
}

function primitiveOfNoteProperty(entry: NoteProperty | undefined): number | string | null {
  if (!entry || !entry.value) return null;
  const v = entry.value;
  switch (v.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
    case 'date':
    case 'createdTime':
    case 'createdBy':
    case 'lastEditedTime':
    case 'lastEditedBy':
      return v.value || null;
    case 'number':
    case 'progress':
      return v.value;
    case 'checkbox':
      return v.value ? 1 : 0;
    case 'multiSelect':
    case 'relation':
    case 'files':
      return v.value.length;
    case 'dateRange':
      return v.value.from || null;
    case 'verification':
      return v.state;
    case 'uniqueId':
      return v.value;
    case 'rollup':
    case 'formula':
      return (v.value as number | string | null) ?? null;
    case 'button':
      return null;
  }
}

/**
 * Run the configured query against a database and return a page of row
 * snapshots.
 *
 * MVP scope: server applies sort by `note.title` / `note.updatedAt` /
 * `note.createdAt` and arbitrary `property.*` fields against the
 * materialised property values. Server-side filtering and grouping are
 * accepted in the request but applied client-side until the filter
 * planner is rewired for the database surface — saved configs survive
 * the round-trip untouched so the upgrade is transparent.
 */
export async function queryDatabaseRows(
  databaseId: UUID,
  request: DatabaseQueryRequest,
): Promise<DatabaseQueryResponse> {
  const memberships = await db
    .select()
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .orderBy(asc(databaseRows.position));

  if (memberships.length === 0) {
    return { total: 0, rows: [] };
  }

  const noteIds = memberships.map((m) => m.noteId);
  const [noteRows, propsByNote] = await Promise.all([
    db.select().from(notes).where(inArray(notes.id, noteIds)),
    resolveDatabaseRowProperties(databaseId, noteIds),
  ]);
  const notesById = new Map(noteRows.map((n) => [n.id, n] as const));

  // Build snapshots preserving membership order.
  let snapshots: DatabaseRowSnapshot[] = [];
  for (const m of memberships) {
    const note = notesById.get(m.noteId);
    if (!note) continue;
    snapshots.push({
      rowId: m.id,
      noteId: m.noteId,
      position: m.position,
      note: {
        id: note.id,
        title: note.title,
        kind: note.kind,
        tags: note.tags,
        locked: note.locked,
        folderId: note.folderId,
        coverImage: note.coverImage ?? null,
        coverPosition: note.coverPosition ?? null,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
      properties: propsByNote.get(m.noteId) ?? [],
    });
  }

  // Server-side sort. Driven entirely by the inline `config.sort`. The
  // datasource has no notion of "saved view" any more — callers (block
  // views, the manager UI, ad-hoc tooling) compose the desired config
  // client-side and POST it on each query.
  const sortRules = request.config?.sort ?? [];
  if (sortRules.length > 0) {
    snapshots = snapshots.slice().sort((a, b) => {
      for (const rule of sortRules) {
        const cmp = compareSnapshots(a, b, rule);
        if (cmp !== 0) return rule.direction === 'desc' ? -cmp : cmp;
      }
      return 0;
    });
  }

  const total = snapshots.length;

  // Pagination (offset/limit) clipped to safe bounds.
  const limit = clampLimit(request.pagination?.limit);
  const offset = Math.max(0, request.pagination?.offset ?? 0);
  const page = snapshots.slice(offset, offset + limit);

  return { total, rows: page };
}

function clampLimit(input: number | undefined): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return ROW_LIMIT_DEFAULT;
  return Math.min(Math.max(1, Math.floor(input)), ROW_LIMIT_MAX);
}

function compareSnapshots(
  a: DatabaseRowSnapshot,
  b: DatabaseRowSnapshot,
  rule: SortRule,
): number {
  const ref = rule.field;
  if (ref.kind === 'system') {
    switch (ref.id) {
      case 'note.title':
        return a.note.title.localeCompare(b.note.title);
      case 'note.kind':
        return a.note.kind.localeCompare(b.note.kind);
      case 'note.createdAt':
        return a.note.createdAt.localeCompare(b.note.createdAt);
      case 'note.updatedAt':
        return a.note.updatedAt.localeCompare(b.note.updatedAt);
      case 'note.locked':
        return Number(a.note.locked) - Number(b.note.locked);
      default:
        return 0;
    }
  }
  if (ref.kind === 'property') {
    const pa = a.properties.find((p) => p.definition.key === ref.key);
    const pb = b.properties.find((p) => p.definition.key === ref.key);
    return compareForSort(pa, pb);
  }
  return 0;
}
