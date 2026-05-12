CREATE TABLE IF NOT EXISTS "documents" (
	"name" text PRIMARY KEY NOT NULL,
	"state" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"chunk" text NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" text NOT NULL,
	"default_kind" text,
	"icon" text,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type" text DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"content_json" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"folder_id" uuid,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'kind' NOT NULL,
	"kind_id" text,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"type" text NOT NULL,
	"icon" text,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"value_text" text,
	"value_number" double precision,
	"value_bool" boolean,
	"value_date" timestamp with time zone,
	"value_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"position" text DEFAULT 'a0' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_source_id_notes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links" ADD CONSTRAINT "links_target_id_notes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_definitions" ADD CONSTRAINT "property_definitions_kind_id_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kinds"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_values" ADD CONSTRAINT "property_values_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property_values" ADD CONSTRAINT "property_values_property_id_property_definitions_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property_definitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "views" ADD CONSTRAINT "views_kind_id_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."kinds"("id") ON DELETE cascade ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_vec_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folders_parent_idx" ON "folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "folders_position_idx" ON "folders" USING btree ("parent_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "folders_parent_slug_uniq" ON "folders" USING btree ("parent_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "links_source_idx" ON "links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "links_target_idx" ON "links" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_title_idx" ON "notes" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_kind_idx" ON "notes" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_folder_idx" ON "notes" USING btree ("folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_definitions_scope_kind_key_uniq" ON "property_definitions" USING btree ("scope","kind_id","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_definitions_kind_idx" ON "property_definitions" USING btree ("kind_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_definitions_position_idx" ON "property_definitions" USING btree ("kind_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "property_values_note_property_uniq" ON "property_values" USING btree ("note_id","property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_values_note_idx" ON "property_values" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_values_property_idx" ON "property_values" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_values_filter_text_idx" ON "property_values" USING btree ("property_id","value_text");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_values_filter_number_idx" ON "property_values" USING btree ("property_id","value_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_values_filter_date_idx" ON "property_values" USING btree ("property_id","value_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "views_kind_idx" ON "views" USING btree ("kind_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "views_position_idx" ON "views" USING btree ("kind_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "views_one_default_per_kind_uniq" ON "views" USING btree ("kind_id") WHERE is_default;