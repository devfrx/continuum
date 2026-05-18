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

  // ── Per-note property definitions ────────────────────────────────────
  // Older databases were created when every property_definition was
  // shared by all notes of the same kind. The model now supports a
  // per-note scope; these statements add the column / indexes safely
  // and migrate existing kind-scoped definitions that already carry
  // user data (`property_values`) into per-note copies, so each note
  // keeps exactly the values it had — without forcing the same schema
  // on its siblings.
  await db.execute(sql`
    ALTER TABLE "property_definitions"
      ADD COLUMN IF NOT EXISTS "note_id" uuid REFERENCES "notes"("id") ON DELETE CASCADE
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS property_definitions_note_idx
      ON property_definitions (note_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS property_definitions_note_position_idx
      ON property_definitions (note_id, position)
  `);

  // Replace the legacy (scope, kind_id, key) unique with one that also
  // accounts for note_id. Dropping is safe: the new index covers the
  // same uniqueness guarantee for kind-scoped rows (note_id is NULL
  // for them) and additionally constrains note-scoped rows.
  await db.execute(sql`
    DROP INDEX IF EXISTS property_definitions_scope_kind_key_uniq
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS property_definitions_scope_owner_key_uniq
      ON property_definitions (scope, kind_id, note_id, key)
  `);

  // One-shot data migration: for every property_value that still
  // points at a kind-scoped definition, materialise a per-note copy
  // and re-point the value to it. Definitions with no values stay as
  // future templates (the kind-scope row is preserved untouched).
  await db.execute(sql`
    DO $$
    DECLARE
      v RECORD;
      new_def_id UUID;
    BEGIN
      FOR v IN
        SELECT DISTINCT pv.note_id    AS note_id,
                        pd.id         AS def_id,
                        pd.kind_id    AS kind_id,
                        pd.key        AS key,
                        pd.label      AS label,
                        pd.type       AS type,
                        pd.icon       AS icon,
                        pd.description AS description,
                        pd.config     AS config,
                        pd.position   AS position
          FROM property_values pv
          JOIN property_definitions pd ON pd.id = pv.property_id
         WHERE pd.scope = 'kind' AND pd.note_id IS NULL
      LOOP
        SELECT id INTO new_def_id
          FROM property_definitions
         WHERE scope = 'note' AND note_id = v.note_id AND key = v.key
         LIMIT 1;
        IF new_def_id IS NULL THEN
          INSERT INTO property_definitions
            (scope, kind_id, note_id, key, label, type, icon, description, config, position)
          VALUES
            ('note', v.kind_id, v.note_id, v.key, v.label, v.type,
             v.icon, v.description, v.config, v.position)
          RETURNING id INTO new_def_id;
        END IF;
        UPDATE property_values
           SET property_id = new_def_id
         WHERE note_id = v.note_id AND property_id = v.def_id;
      END LOOP;
    END $$;
  `);

  // ── Page templates ───────────────────────────────────────────────────
  // First-class reusable templates: bundle of editor body + property
  // definitions (with optional default values) that can be applied to
  // new or existing notes. See `routes/templates.ts`.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "page_templates" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" text NOT NULL,
      "description" text,
      "target_kind" text REFERENCES "kinds"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "content" text NOT NULL DEFAULT '',
      "content_json" jsonb,
      "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "version" double precision NOT NULL DEFAULT 1,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_templates_name_idx ON page_templates (name)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_templates_target_kind_idx
      ON page_templates (target_kind)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "template_properties" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "template_id" uuid NOT NULL REFERENCES "page_templates"("id") ON DELETE CASCADE,
      "key" text NOT NULL,
      "label" text NOT NULL,
      "type" text NOT NULL,
      "icon" text,
      "description" text,
      "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "default_value" jsonb,
      "position" text NOT NULL DEFAULT 'a0',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS template_properties_template_idx
      ON template_properties (template_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS template_properties_position_idx
      ON template_properties (template_id, position)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS template_properties_template_key_uniq
      ON template_properties (template_id, key)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "page_template_applications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "note_id" uuid NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE,
      "template_id" uuid REFERENCES "page_templates"("id") ON DELETE SET NULL,
      "template_version" double precision NOT NULL DEFAULT 1,
      "applied_content" text NOT NULL DEFAULT 'none',
      "applied_property_keys" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "conflicts" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_template_applications_note_idx
      ON page_template_applications (note_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS page_template_applications_template_idx
      ON page_template_applications (template_id)
  `);
}