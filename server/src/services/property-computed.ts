/**
 * Resolve the values of computed and auto-managed property types.
 *
 * Five categories are handled here:
 *
 *  – `createdTime` / `lastEditedTime`     → derived from `notes.createdAt|updatedAt`.
 *  – `createdBy`   / `lastEditedBy`       → derived from the configured identity.
 *  – `uniqueId`                            → atomically allocated sequence per
 *                                            (kind, definition); persisted in
 *                                            `property_values.value_number`.
 *  – `formula`                             → tiny safe expression evaluator
 *                                            over the *other* properties' values.
 *  – `rollup`                              → aggregation across the notes
 *                                            referenced by a relation property.
 *
 * Resolution happens in two passes inside `resolveComputedValues`:
 *   1. Stored + auto-managed values (no inter-property dependencies).
 *   2. Formulas and rollups, which may read pass-1 results.
 *
 * The result is a fully-materialised list of `NoteProperty` ready to be
 * shipped to the client by the routes layer.
 */
import { and, asc, eq, inArray, max as sqlMax, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  databaseRows,
  notes,
  propertyDefinitions,
  propertyValues,
  type NoteRow,
  type PropertyDefinitionRow,
  type PropertyValueRow,
} from '../db/schema.js';
import { definitionRowToDto, valueRowToDto } from './properties.js';
import { evaluateFormula, type FormulaResult } from './formula.js';
import { env } from '../config.js';
import type {
  ButtonAction,
  ButtonConfig,
  CreatedByConfig,
  CreatedTimeConfig,
  FormulaConfig,
  LastEditedByConfig,
  LastEditedTimeConfig,
  NoteProperty,
  PropertyDefinition,
  PropertyValue,
  RollupConfig,
  UniqueIdConfig,
} from '@continuum/shared';

/**
 * Allocate the next sequence number for a uniqueId definition. Wrapped in
 * a single SQL `MAX(value_number) + 1` so concurrent allocations on the
 * same definition stay monotonic without a separate counter table.
 */
async function allocateUniqueIdSequence(propertyId: string): Promise<number> {
  const [row] = await db
    .select({ next: sqlMax(propertyValues.valueNumber) })
    .from(propertyValues)
    .where(eq(propertyValues.propertyId, propertyId));
  const current = row?.next ?? 0;
  return Number(current) + 1;
}

/** Format a uniqueId display string from prefix + sequence. */
function formatUniqueId(prefix: string | undefined, sequence: number): string {
  return prefix && prefix.length > 0 ? `${prefix}-${sequence}` : String(sequence);
}

/**
 * Ensure every uniqueId property has a stored sequence for the supplied
 * note. Uses INSERT … ON CONFLICT DO NOTHING so concurrent requests for
 * the same note never produce duplicate rows.
 */
async function ensureUniqueIdValues(
  noteId: string,
  defs: PropertyDefinitionRow[],
  existing: Map<string, PropertyValueRow>,
): Promise<Map<string, PropertyValueRow>> {
  const next = new Map(existing);
  for (const def of defs) {
    if (def.type !== 'uniqueId') continue;
    if (next.has(def.id)) continue;
    const sequence = await allocateUniqueIdSequence(def.id);
    const [created] = await db
      .insert(propertyValues)
      .values({ noteId, propertyId: def.id, valueNumber: sequence })
      .onConflictDoNothing({
        target: [propertyValues.noteId, propertyValues.propertyId],
      })
      .returning();
    if (created) {
      next.set(def.id, created);
    } else {
      // Race-condition: another request inserted in parallel; reload it.
      const [row] = await db
        .select()
        .from(propertyValues)
        .where(
          and(
            eq(propertyValues.noteId, noteId),
            eq(propertyValues.propertyId, def.id),
          ),
        )
        .limit(1);
      if (row) next.set(def.id, row);
    }
  }
  return next;
}

/** Auto-managed value for the time/identity property types. */
function autoManagedValue(
  def: PropertyDefinition,
  note: NoteRow,
): PropertyValue | null {
  switch (def.type) {
    case 'createdTime': {
      const cfg = def.config as CreatedTimeConfig;
      const iso = note.createdAt.toISOString();
      return { type: 'createdTime', value: cfg.granularity === 'date' ? iso.slice(0, 10) : iso };
    }
    case 'lastEditedTime': {
      const cfg = def.config as LastEditedTimeConfig;
      const iso = note.updatedAt.toISOString();
      return {
        type: 'lastEditedTime',
        value: cfg.granularity === 'date' ? iso.slice(0, 10) : iso,
      };
    }
    case 'createdBy': {
      // Config is currently empty — kept for forward-compatibility when a
      // real identity model lands.
      void (def.config as CreatedByConfig);
      return { type: 'createdBy', value: env.IDENTITY_NAME };
    }
    case 'lastEditedBy': {
      void (def.config as LastEditedByConfig);
      return { type: 'lastEditedBy', value: env.IDENTITY_NAME };
    }
    case 'button': {
      void (def.config as ButtonConfig);
      return { type: 'button' };
    }
    default:
      return null;
  }
}

/**
 * Build a `(propertyKey → PropertyValue|null)` map for formula / rollup
 * resolution. Skips computed types (formula, rollup) on purpose — they are
 * resolved last and we never want a formula to depend on another formula
 * whose result is not yet available.
 */
function indexByKey(entries: NoteProperty[]): Map<string, PropertyValue | null> {
  const out = new Map<string, PropertyValue | null>();
  for (const entry of entries) out.set(entry.definition.key, entry.value);
  return out;
}

/** Reduce a `PropertyValue` to a primitive for use inside a formula. */
function primitiveOf(value: PropertyValue | null | undefined): FormulaResult {
  if (!value) return null;
  switch (value.type) {
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
      return value.value || null;
    case 'number':
    case 'progress':
      return value.value;
    case 'checkbox':
      return value.value;
    case 'multiSelect':
    case 'relation':
      return value.value.length;
    case 'files':
      return value.value.length;
    case 'dateRange':
      return value.value.from || null;
    case 'verification':
      return value.state;
    case 'uniqueId':
      return value.value;
    case 'rollup':
    case 'formula':
      return (value.value as FormulaResult) ?? null;
    case 'button':
      return null;
  }
}

function isNonEmptyRollupValue(value: FormulaResult): boolean {
  return value !== null && value !== '';
}

function rollupNumber(value: FormulaResult): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function rollupDisplayValue(value: FormulaResult | undefined): number | string | null {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'boolean' ? String(value) : value;
}

/**
 * Aggregate primitive rollup values according to the selected function.
 * `count` ignores `values` and uses `total` (number of related notes), while
 * `countNotEmpty` and `showOriginal` work with any non-empty primitive.
 */
function aggregate(
  fn: RollupConfig['aggregation'],
  values: FormulaResult[],
  total: number,
): { value: number | string | null; count: number } {
  const nonEmpty = values.filter(isNonEmptyRollupValue);
  const numericValues = nonEmpty
    .map(rollupNumber)
    .filter((value): value is number => value !== null);
  switch (fn) {
    case 'count':
      return { value: total, count: total };
    case 'countNotEmpty':
      return { value: nonEmpty.length, count: nonEmpty.length };
    case 'sum':
      return { value: numericValues.reduce((a, b) => a + b, 0), count: numericValues.length };
    case 'avg':
      return numericValues.length
        ? {
            value: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
            count: numericValues.length,
          }
        : { value: null, count: 0 };
    case 'min':
      return numericValues.length
        ? { value: Math.min(...numericValues), count: numericValues.length }
        : { value: null, count: 0 };
    case 'max':
      return numericValues.length
        ? { value: Math.max(...numericValues), count: numericValues.length }
        : { value: null, count: 0 };
    case 'showOriginal':
      return { value: rollupDisplayValue(nonEmpty[0]), count: nonEmpty.length };
  }
}

/**
 * Compute a single rollup value by walking the `relationKey` property and
 * fetching the `targetKey` property's stored values from the related notes.
 * Stays within a single round-trip per rollup by batching note ids.
 */
async function resolveRollup(
  cfg: RollupConfig,
  perKey: Map<string, PropertyValue | null>,
): Promise<{ value: number | string | null; count: number }> {
  const relValue = perKey.get(cfg.relationKey);
  const ids = relValue && relValue.type === 'relation' ? relValue.value : [];
  if (ids.length === 0) return aggregate(cfg.aggregation, [], 0);

  if (cfg.aggregation === 'count') {
    return aggregate(cfg.aggregation, [], ids.length);
  }

  if (!cfg.targetKey) return aggregate(cfg.aggregation, [], ids.length);
  const targetDefs = await db
    .select()
    .from(propertyDefinitions)
    .where(eq(propertyDefinitions.key, cfg.targetKey));
  if (targetDefs.length === 0) return aggregate(cfg.aggregation, [], ids.length);

  const targetIds = targetDefs.map((def) => def.id);
  const targetDefsById = new Map(targetDefs.map((def) => [def.id, def] as const));

  const rows = await db
    .select()
    .from(propertyValues)
    .where(
      and(
        inArray(propertyValues.noteId, ids),
        inArray(propertyValues.propertyId, targetIds),
      ),
    );

  const values: FormulaResult[] = [];
  for (const row of rows) {
    const targetDef = targetDefsById.get(row.propertyId);
    if (!targetDef) continue;
    const decoded = valueRowToDto(row, targetDef.type as PropertyDefinition['type']);
    values.push(primitiveOf(decoded));
  }
  return aggregate(cfg.aggregation, values, ids.length);
}

/**
 * Top-level entry point. Build the full effective `NoteProperty[]` for
 * a note. The effective schema is the union of:
 *
 *   – private definitions  (`scope='note'`, `noteId=:id`), and
 *   – shared definitions   (`scope='database'`) from every database the
 *     note is a row of (`database_rows.noteId=:id`).
 *
 * Shared definitions come first, grouped by database, then private
 * definitions. Within each group order is by `position`. This keeps the
 * UI presentation consistent between the note inline panel and the
 * database table headers without any client-side resorting.
 *
 * The routes layer wraps this in `resolveNotePropertiesResponse` so
 * the client also receives the membership ids for realtime
 * subscriptions.
 */
export async function resolveNoteProperties(noteId: string): Promise<NoteProperty[]> {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  if (!note) throw new Error('note-missing');

  const databaseIds = await listNoteDatabaseMemberships(noteId);

  const defConds = [
    and(eq(propertyDefinitions.scope, 'note'), eq(propertyDefinitions.noteId, noteId)),
  ];
  if (databaseIds.length > 0) {
    defConds.push(
      and(
        eq(propertyDefinitions.scope, 'database'),
        inArray(propertyDefinitions.databaseId, databaseIds),
      ),
    );
  }
  const defs = await db
    .select()
    .from(propertyDefinitions)
    .where(or(...defConds))
    .orderBy(asc(propertyDefinitions.position));
  if (defs.length === 0) return [];

  // Stable display order: shared defs first (grouped by databaseId in
  // membership order), then private defs. Position is preserved inside
  // each group thanks to the SQL ORDER BY above.
  const ordered = sortEffectiveDefs(defs, databaseIds);

  const valueRows = await db
    .select()
    .from(propertyValues)
    .where(eq(propertyValues.noteId, noteId));
  return resolveFromPrefetched(note, ordered, valueRows);
}

/**
 * Same as `resolveNoteProperties`, but also returns the list of
 * database ids the note is a row of so the client can subscribe to
 * shared-schema changes on those databases.
 */
export async function resolveNotePropertiesResponse(
  noteId: string,
): Promise<{ properties: NoteProperty[]; databaseIds: string[] }> {
  const properties = await resolveNoteProperties(noteId);
  const databaseIds = await listNoteDatabaseMemberships(noteId);
  return { properties, databaseIds };
}

/** Fetch the ids of every database the note currently belongs to. */
export async function listNoteDatabaseMemberships(noteId: string): Promise<string[]> {
  const rows = await db
    .select({ databaseId: databaseRows.databaseId })
    .from(databaseRows)
    .where(eq(databaseRows.noteId, noteId));
  return rows.map((r) => r.databaseId);
}

/**
 * Order definitions for display: shared first (grouped by membership
 * order, position-sorted inside each db), then private (position-sorted).
 */
function sortEffectiveDefs(
  defs: PropertyDefinitionRow[],
  databaseOrder: string[],
): PropertyDefinitionRow[] {
  const dbIndex = new Map(databaseOrder.map((id, i) => [id, i] as const));
  const shared: PropertyDefinitionRow[] = [];
  const privateDefs: PropertyDefinitionRow[] = [];
  for (const def of defs) {
    if (def.scope === 'database' && def.databaseId && dbIndex.has(def.databaseId)) {
      shared.push(def);
    } else if (def.scope === 'note') {
      privateDefs.push(def);
    }
  }
  shared.sort((a, b) => {
    const ai = dbIndex.get(a.databaseId ?? '') ?? Number.MAX_SAFE_INTEGER;
    const bi = dbIndex.get(b.databaseId ?? '') ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.position.localeCompare(b.position);
  });
  privateDefs.sort((a, b) => a.position.localeCompare(b.position));
  return [...shared, ...privateDefs];
}

/**
 * Inner resolver shared by `resolveNoteProperties` (single-note path) and
 * `resolveNotePropertiesBatch` (graph projection path). Takes a fully
 * pre-fetched bundle so the caller decides how to batch the SQL.
 *
 * Steps:
 *   1. Allocate any missing `uniqueId` sequences for this note.
 *   2. Pass 1 — materialise stored + auto-managed values.
 *   3. Pass 2 — resolve rollup/formula values that may read pass-1 output.
 */
/**
 * Resolve a fully pre-fetched bundle into `NoteProperty[]`. Exported so
 * database-row resolvers (see `services/databases.ts`) can reuse the
 * same uniqueId / formula / rollup pipeline as the regular per-note
 * path without re-implementing it.
 */
export async function resolveFromPrefetched(
  note: NoteRow,
  defs: PropertyDefinitionRow[],
  valueRows: PropertyValueRow[],
): Promise<NoteProperty[]> {
  if (defs.length === 0) return [];

  let byProp = new Map(valueRows.map((row) => [row.propertyId, row] as const));

  // Auto-allocate uniqueId sequences before pass 1 so they show up.
  byProp = await ensureUniqueIdValues(note.id, defs, byProp);

  // Pass 1 — stored + auto-managed.
  const pass1: NoteProperty[] = defs.map((row) => {
    const def = definitionRowToDto(row);
    if (def.type === 'rollup' || def.type === 'formula') {
      // Placeholders; pass 2 will rewrite.
      return { definition: def, value: null };
    }
    if (def.type === 'button') {
      return { definition: def, value: { type: 'button' } };
    }
    const stored = byProp.get(row.id) ?? null;
    if (
      def.type === 'createdTime' ||
      def.type === 'createdBy' ||
      def.type === 'lastEditedTime' ||
      def.type === 'lastEditedBy'
    ) {
      return { definition: def, value: autoManagedValue(def, note) };
    }
    if (def.type === 'uniqueId') {
      const cfg = def.config as UniqueIdConfig;
      const sequence = stored?.valueNumber ?? 0;
      return {
        definition: def,
        value: { type: 'uniqueId', sequence, value: formatUniqueId(cfg.prefix, sequence) },
      };
    }
    return {
      definition: def,
      value: stored ? valueRowToDto(stored, def.type) : null,
    };
  });

  // Pass 2 — rollup + formula resolution. They may read pass-1 results
  // through the keyed index.
  const perKey = indexByKey(pass1);
  const pass2: NoteProperty[] = [];
  for (const entry of pass1) {
    if (entry.definition.type === 'rollup') {
      const cfg = entry.definition.config as RollupConfig;
      const { value, count } = await resolveRollup(cfg, perKey);
      pass2.push({ definition: entry.definition, value: { type: 'rollup', value, count } });
      continue;
    }
    if (entry.definition.type === 'formula') {
      const cfg = entry.definition.config as FormulaConfig;
      try {
        let result = evaluateFormula(cfg.expression || '', (key) => {
          const v = perKey.get(key);
          return primitiveOf(v ?? null);
        });
        if (cfg.output === 'number' && typeof cfg.precision === 'number' && typeof result === 'number') {
          const factor = 10 ** cfg.precision;
          result = Math.round(result * factor) / factor;
        }
        if (cfg.output === 'string' && result !== null && typeof result !== 'string') {
          result = String(result);
        }
        if (cfg.output === 'boolean' && typeof result !== 'boolean') {
          result = Boolean(result);
        }
        pass2.push({ definition: entry.definition, value: { type: 'formula', value: result } });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'formula error';
        pass2.push({
          definition: entry.definition,
          value: { type: 'formula', value: null, error: message },
        });
      }
      continue;
    }
    pass2.push(entry);
  }

  return pass2;
}

/**
 * Resolve `NoteProperty[]` for many notes at once. Used by the graph-query
 * endpoint to materialise property snapshots for every node in a single
 * request without falling back to N+1 calls of `resolveNoteProperties`.
 *
 * Batching strategy:
 *
 *  – `notes` rows fetched once with `inArray`.
 *  – Property definitions fetched once for the union of (kindId IN kinds)
 *    OR `scope='global'`, then optionally narrowed to `propertyKeys`
 *    when the caller passes an allow-list (graph projection case).
 *  – `property_values` rows fetched once per (note × def) pair, indexed
 *    by `noteId` for fast per-note lookup.
 *  – `uniqueId` allocation, rollup resolution and formula evaluation
 *    still happen per-note (they intrinsically need per-note context),
 *    but in parallel via `Promise.all`.
 *
 * Notes whose row is missing from the database silently produce an empty
 * `NoteProperty[]` so the caller can pass an arbitrary id list without a
 * separate validation step.
 */
export async function resolveNotePropertiesBatch(
  noteIds: string[],
  propertyKeys?: string[] | null,
): Promise<Map<string, NoteProperty[]>> {
  const out = new Map<string, NoteProperty[]>();
  if (noteIds.length === 0) return out;

  const noteRows = await db.select().from(notes).where(inArray(notes.id, noteIds));
  const notesById = new Map(noteRows.map((n) => [n.id, n] as const));

  if (noteRows.length === 0) {
    for (const id of noteIds) out.set(id, []);
    return out;
  }

  const membershipRows = await db
    .select({ noteId: databaseRows.noteId, databaseId: databaseRows.databaseId })
    .from(databaseRows)
    .where(inArray(databaseRows.noteId, noteRows.map((n) => n.id)));

  const databaseIdsByNote = new Map<string, string[]>();
  const allDatabaseIds = new Set<string>();
  for (const row of membershipRows) {
    const list = databaseIdsByNote.get(row.noteId) ?? [];
    list.push(row.databaseId);
    databaseIdsByNote.set(row.noteId, list);
    allDatabaseIds.add(row.databaseId);
  }

  const scopedDefConds = [
    and(
      eq(propertyDefinitions.scope, 'note'),
      inArray(propertyDefinitions.noteId, noteRows.map((n) => n.id)),
    ),
  ];
  if (allDatabaseIds.size > 0) {
    scopedDefConds.push(
      and(
        eq(propertyDefinitions.scope, 'database'),
        inArray(propertyDefinitions.databaseId, Array.from(allDatabaseIds)),
      ),
    );
  }

  const defConds = [or(...scopedDefConds)];
  if (propertyKeys && propertyKeys.length > 0) {
    defConds.push(inArray(propertyDefinitions.key, propertyKeys));
  }
  const defs = await db
    .select()
    .from(propertyDefinitions)
    .where(and(...defConds))
    .orderBy(asc(propertyDefinitions.position));

  // Group private defs by note and shared defs by database. Each output
  // note receives exactly the same effective schema as `resolveNoteProperties`:
  // database-scoped definitions from its memberships first, then private defs.
  const defsByNote = new Map<string, PropertyDefinitionRow[]>();
  const defsByDatabase = new Map<string, PropertyDefinitionRow[]>();
  for (const def of defs) {
    if (def.scope === 'note' && def.noteId) {
      const arr = defsByNote.get(def.noteId) ?? [];
      arr.push(def);
      defsByNote.set(def.noteId, arr);
    } else if (def.scope === 'database' && def.databaseId) {
      const arr = defsByDatabase.get(def.databaseId) ?? [];
      arr.push(def);
      defsByDatabase.set(def.databaseId, arr);
    }
  }

  const allDefIds = defs.map((d) => d.id);
  const valueRows =
    allDefIds.length === 0
      ? []
      : await db
          .select()
          .from(propertyValues)
          .where(
            and(
              inArray(propertyValues.noteId, noteIds),
              inArray(propertyValues.propertyId, allDefIds),
            ),
          );

  const valuesByNote = new Map<string, PropertyValueRow[]>();
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
      const databaseIds = databaseIdsByNote.get(id) ?? [];
      const sharedDefs = databaseIds.flatMap((databaseId) => defsByDatabase.get(databaseId) ?? []);
      const privateDefs = defsByNote.get(id) ?? [];
      const noteDefs = sortEffectiveDefs([...sharedDefs, ...privateDefs], databaseIds);
      const noteValues = valuesByNote.get(id) ?? [];
      out.set(id, await resolveFromPrefetched(note, noteDefs, noteValues));
    }),
  );

  return out;
}

/**
 * Apply a button action server-side when the action requires persistence
 * (currently `set-property` and `increment-property`). For `open-url` the
 * client opens the link locally and never calls back into the server.
 *
 * @returns The updated `PropertyValue` for the affected target property,
 *   or `null` if the action only triggers a client-side side-effect.
 */
export async function executeButtonAction(
  noteId: string,
  action: ButtonAction,
): Promise<{ targetPropertyId: string; value: PropertyValue | null } | null> {
  if (action.type === 'open-url') return null;

  // `set-property` and `increment-property` both target a property by key.
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId)).limit(1);
  if (!note) throw new Error('note-missing');
  const target = await resolveEffectiveDefinitionByKey(note, action.targetKey ?? '');
  if (!target) throw new Error('button-target-missing');

  if (action.type === 'increment-property') {
    if (target.type !== 'number' && target.type !== 'progress') {
      throw new Error('button-target-not-numeric');
    }
    const delta = typeof action.delta === 'number' ? action.delta : 1;
    const current = await db
      .select()
      .from(propertyValues)
      .where(
        and(
          eq(propertyValues.noteId, noteId),
          eq(propertyValues.propertyId, target.id),
        ),
      )
      .limit(1);
    const before = Number(current[0]?.valueNumber ?? 0);
    const next = before + delta;
    const [row] = await db
      .insert(propertyValues)
      .values({ noteId, propertyId: target.id, valueNumber: next })
      .onConflictDoUpdate({
        target: [propertyValues.noteId, propertyValues.propertyId],
        set: { valueNumber: next, updatedAt: new Date() },
      })
      .returning();
    return {
      targetPropertyId: target.id,
      value: valueRowToDto(row, target.type as PropertyDefinition['type']),
    };
  }

  // `set-property`: persist the supplied value, or clear the field when the
  // action intentionally carries no typed value.
  const value = action.value as PropertyValue | null | undefined;
  if (!value || typeof value !== 'object' || !('type' in value)) {
    await db
      .delete(propertyValues)
      .where(
        and(
          eq(propertyValues.noteId, noteId),
          eq(propertyValues.propertyId, target.id),
        ),
      );
    return { targetPropertyId: target.id, value: null };
  }
  const { valueDtoToRow } = await import('./properties.js');
  const encoded = valueDtoToRow(value);
  if (!encoded) {
    await db
      .delete(propertyValues)
      .where(
        and(
          eq(propertyValues.noteId, noteId),
          eq(propertyValues.propertyId, target.id),
        ),
      );
    return { targetPropertyId: target.id, value: null };
  }
  const [row] = await db
    .insert(propertyValues)
    .values({ noteId, propertyId: target.id, ...encoded })
    .onConflictDoUpdate({
      target: [propertyValues.noteId, propertyValues.propertyId],
      set: { ...encoded, updatedAt: new Date() },
    })
    .returning();
  return {
    targetPropertyId: target.id,
    value: valueRowToDto(row, target.type as PropertyDefinition['type']),
  };
}

/**
 * Resolve a property definition by key using the same effective ordering
 * as the note property panel. When a private definition intentionally
 * shadows a shared database definition, the private one wins because it is
 * ordered last by `sortEffectiveDefs`.
 */
async function resolveEffectiveDefinitionByKey(
  note: NoteRow,
  key: string,
): Promise<PropertyDefinitionRow | null> {
  if (!key) return null;
  const databaseIds = await listNoteDatabaseMemberships(note.id);
  const conditions = [
    and(
      eq(propertyDefinitions.scope, 'note'),
      eq(propertyDefinitions.noteId, note.id),
      eq(propertyDefinitions.key, key),
    ),
  ];
  if (databaseIds.length > 0) {
    conditions.push(
      and(
        eq(propertyDefinitions.scope, 'database'),
        inArray(propertyDefinitions.databaseId, databaseIds),
        eq(propertyDefinitions.key, key),
      ),
    );
  }
  const defs = await db
    .select()
    .from(propertyDefinitions)
    .where(or(...conditions))
    .orderBy(asc(propertyDefinitions.position));
  const ordered = sortEffectiveDefs(defs, databaseIds);
  return ordered[ordered.length - 1] ?? null;
}

// Unused import guard kept to keep `sql` template available for future
// composite aggregations without a re-import.
void sql;
