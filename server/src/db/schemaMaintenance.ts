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
}