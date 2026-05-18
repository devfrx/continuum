/**
 * Block-scoped views service.
 *
 * A `BlockView` (table `database_block_views`) is a saved view that
 * lives inside a single Tiptap `database` block. Each view points at a
 * specific datasource (`dataSourceDatabaseId`) and persists its layout
 * knobs in `config` (jsonb).
 *
 * Lifecycle:
 *   - Created when the user picks "Add view" inside a block (or, for
 *     the very first view, when they create / link a datasource via
 *     the unbound picker).
 *   - Updated as the user tweaks the view (rename, change type, edit
 *     config, swap datasource).
 *   - Removed when the user deletes the view from the toolbar context
 *     menu, or implicitly when the datasource is deleted (FK CASCADE
 *     on `data_source_database_id`).
 *
 * This service mirrors the conventions of `services/databases.ts`:
 * thin Drizzle wrappers, position via the shared `appendPosition`
 * LexoRank helper, jsonb config normalised through `normalizeViewConfig`.
 */
import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { databaseBlockViews, type DatabaseViewRow } from '../db/schema.js';
import {
  EMPTY_DATABASE_VIEW_CONFIG,
  type DatabaseView,
  type DatabaseViewConfig,
  type DatabaseViewType,
  type UUID,
} from '@continuum/shared';
import { appendPosition, normalizeViewConfig } from './databases.js';

// ─────────────────────────── Mappers ───────────────────────────────────

export function blockViewRowToDto(row: DatabaseViewRow): DatabaseView {
  return {
    id: row.id,
    blockId: row.blockId,
    dataSourceDatabaseId: row.dataSourceDatabaseId,
    name: row.name,
    type: row.type as DatabaseViewType,
    position: row.position,
    config: normalizeViewConfig(row.config),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─────────────────────────── Helpers ───────────────────────────────────

async function nextBlockViewPosition(blockId: string): Promise<string> {
  const rows = await db
    .select({ position: databaseBlockViews.position })
    .from(databaseBlockViews)
    .where(eq(databaseBlockViews.blockId, blockId))
    .orderBy(asc(databaseBlockViews.position));
  return appendPosition(rows.length ? rows[rows.length - 1].position : null);
}

// ─────────────────────────── Public API ────────────────────────────────

/** List every view bound to a block, in stable LexoRank order. */
export async function listBlockViews(blockId: string): Promise<DatabaseView[]> {
  const rows = await db
    .select()
    .from(databaseBlockViews)
    .where(eq(databaseBlockViews.blockId, blockId))
    .orderBy(asc(databaseBlockViews.position));
  return rows.map(blockViewRowToDto);
}

/** Fetch one view by id, or `null` if it has been deleted. */
export async function getBlockView(viewId: UUID): Promise<DatabaseView | null> {
  const [row] = await db
    .select()
    .from(databaseBlockViews)
    .where(eq(databaseBlockViews.id, viewId))
    .limit(1);
  return row ? blockViewRowToDto(row) : null;
}

export interface CreateBlockViewInput {
  blockId: string;
  dataSourceDatabaseId: UUID;
  name: string;
  type: DatabaseViewType;
  position?: string;
  config?: Partial<DatabaseViewConfig>;
}

/** Create a new view for a block, appended at the end by default. */
export async function createBlockView(
  input: CreateBlockViewInput,
): Promise<DatabaseView> {
  const position = input.position ?? (await nextBlockViewPosition(input.blockId));
  const config = normalizeViewConfig({ ...EMPTY_DATABASE_VIEW_CONFIG, ...input.config });
  const [row] = await db
    .insert(databaseBlockViews)
    .values({
      blockId: input.blockId,
      dataSourceDatabaseId: input.dataSourceDatabaseId,
      name: input.name,
      type: input.type,
      position,
      config,
    })
    .returning();
  return blockViewRowToDto(row);
}

export interface UpdateBlockViewInput {
  name?: string;
  type?: DatabaseViewType;
  position?: string;
  dataSourceDatabaseId?: UUID;
  config?: Partial<DatabaseViewConfig>;
}

function mergeViewConfigPatch(
  current: DatabaseViewConfig,
  patch: Partial<DatabaseViewConfig>,
): DatabaseViewConfig {
  const merged: Partial<DatabaseViewConfig> = { ...current, ...patch };
  if (patch.layout !== undefined) {
    merged.layout = patch.layout === null
      ? null
      : { ...(current.layout ?? {}), ...patch.layout };
  }
  return normalizeViewConfig(merged);
}

/**
 * Patch one view. The `config` patch is shallow-merged on top of the
 * existing stored config so callers can rewrite a single key (e.g.
 * `sort`) without round-tripping the whole document. The nested
 * `layout` bag is deep-merged because settings panels emit one knob at
 * a time and must not clobber sibling layout values.
 */
export async function updateBlockView(
  viewId: UUID,
  patch: UpdateBlockViewInput,
): Promise<DatabaseView | null> {
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.type !== undefined) fields.type = patch.type;
  if (patch.position !== undefined) fields.position = patch.position;
  if (patch.dataSourceDatabaseId !== undefined) {
    fields.dataSourceDatabaseId = patch.dataSourceDatabaseId;
  }
  if (patch.config !== undefined) {
    const [existing] = await db
      .select()
      .from(databaseBlockViews)
      .where(eq(databaseBlockViews.id, viewId))
      .limit(1);
    if (!existing) return null;
    const current = normalizeViewConfig(existing.config);
    fields.config = mergeViewConfigPatch(current, patch.config);
  }
  const [updated] = await db
    .update(databaseBlockViews)
    .set(fields)
    .where(eq(databaseBlockViews.id, viewId))
    .returning();
  return updated ? blockViewRowToDto(updated) : null;
}

/** Delete a single view. Callers enforce \"can't delete the last view\" UX. */
export async function deleteBlockView(viewId: UUID): Promise<void> {
  await db.delete(databaseBlockViews).where(eq(databaseBlockViews.id, viewId));
}

/**
 * Count how many views a block has. Used by the routes layer to reject
 * the deletion of the only remaining view (a block must always end up
 * with either 0 views — empty picker — or ≥1 view).
 */
export async function countBlockViews(blockId: string): Promise<number> {
  const rows = await db
    .select({ id: databaseBlockViews.id })
    .from(databaseBlockViews)
    .where(eq(databaseBlockViews.blockId, blockId));
  return rows.length;
}
