/**
 * Notion-like Database service.
 *
 * Orchestrates the four resources that make up a Database:
 *   1. The database itself (`databases`),
 *   2. Saved views (`database_views`),
 *   3. Schema — property definitions with `scope='database'`,
 *   4. Rows — membership rows in `database_rows`, each pointing at a
 *      `notes` entry that carries the row's content and property values.
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
  databaseViews,
  notes,
  propertyDefinitions,
  propertyValues,
  type DatabaseRowEntity,
  type DatabaseMembershipRow,
  type DatabaseViewRow,
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
  type DatabaseView,
  type DatabaseViewConfig,
  type DatabaseViewType,
  type NoteProperty,
  type PropertyConfig,
  type PropertyType,
  type SortRule,
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

export function viewRowToDto(row: DatabaseViewRow): DatabaseView {
  return {
    id: row.id,
    databaseId: row.databaseId,
    name: row.name,
    type: row.type as DatabaseViewType,
    position: row.position,
    dataSourceDatabaseId: row.dataSourceDatabaseId ?? null,
    config: normalizeViewConfig(row.config),
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
 * rendering when the shape grows.
 */
function normalizeViewConfig(raw: unknown): DatabaseViewConfig {
  const base = EMPTY_DATABASE_VIEW_CONFIG;
  if (!raw || typeof raw !== 'object') return { ...base };
  const obj = raw as Partial<DatabaseViewConfig>;
  return {
    filter: obj.filter ?? base.filter,
    sort: Array.isArray(obj.sort) ? obj.sort : base.sort,
    group: obj.group ?? null,
    visibleProperties: obj.visibleProperties ?? null,
    hiddenProperties: Array.isArray(obj.hiddenProperties) ? obj.hiddenProperties : [],
    layout: obj.layout ?? null,
  };
}

// ─────────────────────────── LexoRank helpers ──────────────────────────

/** Cheap append helper: takes the lexicographically-last position and
 *  appends `'m'`, mirroring the heuristic used by per-note properties. */
function appendPosition(last: string | null): string {
  return last ? `${last}m` : 'a0';
}

async function nextRowPosition(databaseId: UUID): Promise<string> {
  const rows = await db
    .select({ position: databaseRows.position })
    .from(databaseRows)
    .where(eq(databaseRows.databaseId, databaseId))
    .orderBy(asc(databaseRows.position));
  return appendPosition(rows.length ? rows[rows.length - 1].position : null);
}

async function nextViewPosition(databaseId: UUID): Promise<string> {
  const rows = await db
    .select({ position: databaseViews.position })
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(asc(databaseViews.position));
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

// ─────────────────────────── Public API ────────────────────────────────

/** Fetch a single database by id, or `null` when missing. */
export async function getDatabaseById(id: UUID): Promise<DatabaseRowEntity | null> {
  const [row] = await db.select().from(databases).where(eq(databases.id, id)).limit(1);
  return row ?? null;
}

/** Bundle returned by `loadDatabaseBundle` — used by the editor on mount. */
export type { DatabaseBundle };

/**
 * Single round-trip helper: load the database + its views + its schema.
 * Used by the embed component to populate the toolbar without firing
 * three separate fetches.
 */
export async function loadDatabaseBundle(id: UUID): Promise<DatabaseBundle | null> {
  const dbRow = await getDatabaseById(id);
  if (!dbRow) return null;
  const [viewRows, defRows] = await Promise.all([
    db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.databaseId, id))
      .orderBy(asc(databaseViews.position)),
    db
      .select()
      .from(propertyDefinitions)
      .where(eq(propertyDefinitions.databaseId, id))
      .orderBy(asc(propertyDefinitions.position)),
  ]);
  return {
    database: databaseRowToDto(dbRow),
    views: viewRows.map(viewRowToDto),
    schema: defRows.map(definitionRowToDto),
  };
}

// ─────────────────────────── Create ────────────────────────────────────

export async function createDatabase(input: {
  title?: string;
  description?: string | null;
  icon?: string | null;
}): Promise<{ database: Database; views: DatabaseView[] }> {
  const [created] = await db
    .insert(databases)
    .values({
      title: input.title ?? '',
      description: input.description ?? null,
      icon: input.icon ?? null,
    })
    .returning();

  // Seed a default table view so the block renders something meaningful
  // immediately after creation — empty databases shouldn't surface a
  // "no view configured" empty state.
  const [view] = await db
    .insert(databaseViews)
    .values({
      databaseId: created.id,
      name: 'Table',
      type: 'table',
      position: 'a0',
      config: EMPTY_DATABASE_VIEW_CONFIG,
    })
    .returning();

  return {
    database: databaseRowToDto(created),
    views: [viewRowToDto(view)],
  };
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
  // FK cascades wipe views, rows, and database-scoped property definitions.
  // The underlying notes are intentionally preserved — deleting a database
  // unbinds its rows but does not delete user content. Callers that want
  // to also delete the row notes must do so explicitly before removal.
  await db.delete(databases).where(eq(databases.id, id));
}

// ─────────────────────────── Views ─────────────────────────────────────

export async function listViews(databaseId: UUID): Promise<DatabaseView[]> {
  const rows = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, databaseId))
    .orderBy(asc(databaseViews.position));
  return rows.map(viewRowToDto);
}

export async function createView(
  databaseId: UUID,
  input: {
    name: string;
    type: DatabaseViewType;
    position?: string;
    config?: Partial<DatabaseViewConfig>;
  },
): Promise<DatabaseView> {
  const position = input.position ?? (await nextViewPosition(databaseId));
  const config = normalizeViewConfig({ ...EMPTY_DATABASE_VIEW_CONFIG, ...input.config });
  const [row] = await db
    .insert(databaseViews)
    .values({ databaseId, name: input.name, type: input.type, position, config })
    .returning();
  return viewRowToDto(row);
}

export async function updateView(
  viewId: UUID,
  patch: {
    name?: string;
    type?: DatabaseViewType;
    position?: string;
    dataSourceDatabaseId?: UUID | null;
    config?: Partial<DatabaseViewConfig>;
  },
): Promise<DatabaseView | null> {
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.position !== undefined) fields.position = patch.position;
  if (patch.dataSourceDatabaseId !== undefined) {
    fields.dataSourceDatabaseId = patch.dataSourceDatabaseId;
  }
  if (patch.config !== undefined) {
    // Merge on top of the existing stored config so callers can patch
    // a single key (e.g. `sort`) without round-tripping the whole config.
    const [existing] = await db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, viewId))
      .limit(1);
    if (!existing) return null;
    const current = normalizeViewConfig(existing.config);
    fields.config = normalizeViewConfig({ ...current, ...patch.config });
  }
  const [updated] = await db
    .update(databaseViews)
    .set(fields)
    .where(eq(databaseViews.id, viewId))
    .returning();
  return updated ? viewRowToDto(updated) : null;
}

export async function deleteView(viewId: UUID): Promise<void> {
  await db.delete(databaseViews).where(eq(databaseViews.id, viewId));
}

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
  await db.delete(databaseRows).where(eq(databaseRows.id, rowId));
  if (options.deleteNote) {
    await db.delete(notes).where(eq(notes.id, row.noteId));
  }
}

export async function reorderRows(
  databaseId: UUID,
  orderedRowIds: UUID[],
): Promise<void> {
  // Rewrite positions as evenly-spaced LexoRank slots so subsequent
  // single-row inserts stay cheap. Mirrors `positionForIndex` in
  // routes/properties.ts.
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedRowIds.entries()) {
      const position = `p${String((index + 1) * 1000).padStart(8, '0')}`;
      await tx
        .update(databaseRows)
        .set({ position, updatedAt: new Date() })
        .where(and(eq(databaseRows.id, id), eq(databaseRows.databaseId, databaseId)));
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
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
      properties: propsByNote.get(m.noteId) ?? [],
    });
  }

  // Server-side sort. When the caller supplies an ad-hoc `config` override
  // we use it as-is; otherwise we fall back to the saved view's persisted
  // sort rules so switching the active view actually re-orders the rows.
  let viewSortRules: SortRule[] = [];
  if (request.viewId) {
    const [savedView] = await db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, request.viewId))
      .limit(1);
    if (savedView) {
      const cfg = savedView.config as { sort?: SortRule[] } | null;
      viewSortRules = cfg?.sort ?? [];
    }
  }
  const sortRules = request.config?.sort ?? viewSortRules;
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
