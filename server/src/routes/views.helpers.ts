/**
 * Internal helpers for the Database Views REST API.
 *
 * Kept separate from `routes/views.ts` to keep the route plugin under the
 * 350-line file budget. These are intentionally not exported from a
 * barrel — they are private utilities for the views layer only.
 */

import { asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { kinds, views, type ViewRow } from '../db/schema.js';
import {
  createDefaultViewConfig,
  databaseViewConfigSchema,
  type DatabaseView,
  type DatabaseViewConfig,
} from '@continuum/shared';

/**
 * Compact representation used by tab strips and the view picker. Includes
 * only the fields the UI needs to render a tab without loading the full
 * configuration blob.
 */
export interface ViewSummaryDto {
  id: string;
  name: string;
  isDefault: boolean;
  locked: boolean;
  position: string;
  layoutType: string;
  updatedAt: string;
}

/**
 * Normalised lexicographic rank used when a kind's views are reordered.
 * Mirrors the helper in `properties.ts` so view tabs and property tabs
 * share the same ordering scheme.
 */
export function positionForIndex(index: number): string {
  return `p${String((index + 1) * 1000).padStart(8, '0')}`;
}

/**
 * Compute the next "append at end" LexoRank position for views of a
 * given kind. Returns `'a0'` when the kind has no views yet.
 */
export async function nextPosition(kindId: string): Promise<string> {
  const rows = await db
    .select({ position: views.position })
    .from(views)
    .where(eq(views.kindId, kindId))
    .orderBy(asc(views.position));
  if (rows.length === 0) return 'a0';
  return `${rows[rows.length - 1].position}m`;
}

/** Returns true when a kind row exists for the given id. */
export async function kindExists(kindId: string): Promise<boolean> {
  const [kind] = await db.select({ id: kinds.id }).from(kinds).where(eq(kinds.id, kindId)).limit(1);
  return Boolean(kind);
}

/**
 * Parse a row's JSONB `config` blob into a strict {@link DatabaseViewConfig}.
 * Falls back to {@link createDefaultViewConfig} when the stored payload is
 * malformed (e.g. produced by an older server version) so the API never
 * returns a malformed view.
 */
export function parseConfig(row: ViewRow): DatabaseViewConfig {
  const parsed = databaseViewConfigSchema.safeParse(row.config);
  if (parsed.success) return parsed.data;
  console.warn(`[views] config for ${row.id} failed schema validation; using defaults`);
  return createDefaultViewConfig(row.kindId);
}

/** Map a DB row to the full wire-shape `DatabaseView`. */
export function rowToDto(row: ViewRow): DatabaseView {
  return {
    ...parseConfig(row),
    id: row.id,
    kindId: row.kindId,
    name: row.name,
    isDefault: row.isDefault,
    locked: row.locked,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Map a DB row to the compact `ViewSummaryDto` used by tab strips. */
export function rowToSummary(row: ViewRow): ViewSummaryDto {
  const cfg = row.config as { layout?: { type?: string } } | null;
  const layoutType = cfg?.layout?.type ?? 'table';
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    locked: row.locked,
    position: row.position,
    layoutType,
    updatedAt: row.updatedAt.toISOString(),
  };
}
