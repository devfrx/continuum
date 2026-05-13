/**
 * Note query — execute the SQL portion of a planned filter.
 *
 * This is intentionally tiny: it pre-fetches the property definitions the
 * filter references, runs the planner, and returns the matching `notes`
 * rows. Metric post-filtering is the caller's responsibility (the graph
 * orchestrator owns the edge set, which is required to evaluate metrics).
 */
import { inArray, type SQL } from 'drizzle-orm';
import type { FilterNode } from '@continuum/shared';
import { db } from '../../db/client.js';
import {
  notes,
  propertyDefinitions,
  type NoteRow,
  type PropertyDefinitionRow,
} from '../../db/schema.js';
import {
  collectPropertyIds,
  planFilter,
  type PlanResult,
  type PropertyDefIndex,
} from './filter-planner.js';

export interface NoteQueryResult {
  rows: NoteRow[];
  /**
   * Conditions that the planner could not express in SQL (currently only
   * `graphMetric` fields). The graph orchestrator applies them in JS once
   * it has the edge set.
   */
  postFilters: PlanResult['postFilters'];
}

/**
 * Run the SQL portion of `filter` against the `notes` table and return the
 * matching rows together with any deferred (metric) conditions.
 *
 * Empty filter trees match everything — the planner returns `sql: null`
 * and we skip the `WHERE` clause entirely.
 */
export async function executeNoteQuery(
  filter: FilterNode,
  now: Date = new Date(),
): Promise<NoteQueryResult> {
  const propertyIds = collectPropertyIds(filter);
  const defIndex: PropertyDefIndex = new Map<string, PropertyDefinitionRow>();
  if (propertyIds.length > 0) {
    const defs = await db
      .select()
      .from(propertyDefinitions)
      .where(inArray(propertyDefinitions.id, propertyIds));
    for (const def of defs) defIndex.set(def.id, def);
  }

  const plan = planFilter(filter, defIndex, now);
  const where: SQL | null = plan.sql;
  const rows = where
    ? await db.select().from(notes).where(where)
    : await db.select().from(notes);

  return { rows, postFilters: plan.postFilters };
}
