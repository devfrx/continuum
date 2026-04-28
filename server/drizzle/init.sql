CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "documents" (
        "name" text PRIMARY KEY NOT NULL,
        "state" bytea NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "title" text NOT NULL,
        "kind" text DEFAULT 'note' NOT NULL,
        "content" text DEFAULT '' NOT NULL,
        "content_json" jsonb,
        "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "embeddings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "note_id" uuid NOT NULL,
        "chunk" text NOT NULL,
        "embedding" vector(768),
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "source_id" uuid NOT NULL,
        "target_id" uuid NOT NULL,
        "type" text DEFAULT 'related' NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_source_id_notes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_target_id_notes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "embeddings_vec_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "links_source_idx" ON "links" USING btree ("source_id");
CREATE INDEX IF NOT EXISTS "links_target_idx" ON "links" USING btree ("target_id");
CREATE INDEX IF NOT EXISTS "notes_title_idx" ON "notes" USING btree ("title");
CREATE INDEX IF NOT EXISTS "notes_kind_idx" ON "notes" USING btree ("kind");

CREATE TABLE IF NOT EXISTS "kinds" (
        "id" text PRIMARY KEY NOT NULL,
        "label" text NOT NULL,
        "color" text DEFAULT '#9A9286' NOT NULL,
        "icon" text DEFAULT 'kind-custom' NOT NULL,
        "description" text,
        "builtin" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "kinds" (id, label, color, icon, builtin)
VALUES ('note', 'Note', '#8C7B6A', 'kind-note', true)
ON CONFLICT (id) DO NOTHING;
