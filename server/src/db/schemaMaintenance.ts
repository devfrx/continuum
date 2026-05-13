import { sql } from 'drizzle-orm';
import { db } from './client.js';

/**
 * Apply tiny, idempotent schema patches required by existing local databases.
 *
 * Docker entrypoint SQL only runs when the Postgres data directory is created
 * for the first time. During development, users usually keep the volume across
 * app updates, so additive columns must be repaired at server startup before
 * routes or seeders perform inserts using the current Drizzle schema.
 */
export async function ensureDatabaseSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "notes"
      ADD COLUMN IF NOT EXISTS "locked" boolean NOT NULL DEFAULT false
  `);

  // GIN index over `value_json` so jsonb containment / `?|` lookups used
  // by the property-filter SQL stay fast as the property_values table
  // grows. `jsonb_path_ops` is the right opclass for `@>` containment,
  // which is what the planner emits for multi-select / relation filters.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS property_values_value_json_gin
      ON property_values USING gin (value_json jsonb_path_ops)
  `);

  // Composite index used by checkbox-property filters (very common in
  // kanban-style views). Mirrors the existing text/number/date filter
  // indexes already declared in the Drizzle schema.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS property_values_filter_bool_idx
      ON property_values (property_id, value_bool)
  `);
}