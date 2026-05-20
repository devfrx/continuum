import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  vector,
  boolean,
  doublePrecision,
  customType,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType: () => 'bytea',
});

const EMB_DIM = Number(process.env.AI_EMBEDDING_DIMENSIONS ?? 768);

/**
 * Hierarchical folders. Self-referencing tree (`parent_id` → `folders.id`)
 * with `ON DELETE CASCADE` so deleting a folder removes its subtree.
 *
 * `defaultKind`, `icon` and `color` are nullable on purpose: a `null` value
 * means "inherit from parent" (Modality B). Resolution of effective values
 * happens server-side in `services/folder-tree.ts`.
 *
 * `position` stores a LexoRank-style fractional rank so reordering siblings
 * never requires renumbering the entire list.
 */
export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    position: text('position').notNull(),
    defaultKind: text('default_kind'),
    icon: text('icon'),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdx: index('folders_parent_idx').on(t.parentId),
    positionIdx: index('folders_position_idx').on(t.parentId, t.position),
    // Slug must be unique per parent. Postgres treats NULL as distinct in a
    // standard unique index, so two roots can both use the same slug — the
    // routes layer enforces uniqueness for `parent_id IS NULL` separately.
    uniqSlug: uniqueIndex('folders_parent_slug_uniq').on(t.parentId, t.slug),
  }),
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('note'),
    content: text('content').notNull().default(''),
    contentJson: jsonb('content_json'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    /**
     * Optional cover image URL/path shown above the editor and used by
     * Gallery views as the card header when no other heuristic matches.
     * Stored as a string (relative `/uploads/...` or absolute URL).
     */
    coverImage: text('cover_image'),
    coverPosition: jsonb('cover_position').$type<import('@continuum/shared').CoverPosition | null>(),
    /** Owning folder; `null` = root ("Inbox"). */
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    /**
     * When true, the note is "finalized" and read-only: title, kind, tags,
     * content, folder, properties cannot be mutated. The only field a
     * client may PUT is `locked` itself (to unlock). Enforced server-side
     * in `routes/notes.ts`.
     */
    locked: boolean('locked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    titleIdx: index('notes_title_idx').on(t.title),
    kindIdx: index('notes_kind_idx').on(t.kind),
    folderIdx: index('notes_folder_idx').on(t.folderId),
  }),
);

export const embeddings = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    chunk: text('chunk').notNull(),
    embedding: vector('embedding', { dimensions: EMB_DIM }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // HNSW index for fast cosine similarity search
    embIdx: index('embeddings_vec_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  }),
);

export const links = pgTable(
  'links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    targetId: uuid('target_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    type: text('type').notNull().default('related'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceIdx: index('links_source_idx').on(t.sourceId),
    targetIdx: index('links_target_idx').on(t.targetId),
  }),
);

// Y.Doc binary state for real-time collaboration via Hocuspocus.
export const documents = pgTable('documents', {
  name: text('name').primaryKey(),
  state: bytea('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * User-defined note categories. The `'note'` row is seeded as `builtin=true`
 * and may not be edited or deleted from the API.
 */
export const kinds = pgTable('kinds', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  color: text('color').notNull().default('#9A9286'),
  icon: text('icon').notNull().default('kind-custom'),
  description: text('description'),
  builtin: boolean('builtin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Custom property schema. A `property_definition` describes the shape of a
 * property (text, number, select, …) attached to a given scope.
 *
 * - `scope='note'`   — owned by a single note (the default the UI creates).
 * - `scope='kind'`   — reserved for the future Templates feature.
 * - `scope='global'` — reserved for properties shared across every note.
 *
 * The `config` JSON column holds type-specific settings (e.g. select
 * options, number unit, relation target kind). See the discriminated union
 * `PropertyConfig` in `@continuum/shared` for the canonical shape.
 *
 * The `key` column is a slug derived once from the label, immutable, and
 * unique per owner (per-kind for kind-scoped, per-note for note-scoped).
 * The label is rename-safe.
 */
export const propertyDefinitions = pgTable(
  'property_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Where the definition is mounted:
     *  - `'note'`   — owned by a single note (default for user-created
     *                 properties; only that note sees it).
     *  - `'kind'`   — reserved for the future Templates feature: a
     *                 definition shared across every note of a kind.
     *                 Not auto-applied to notes; the Templates UI must
     *                 explicitly materialise per-note copies.
     *  - `'global'` — reserved for properties shared across every note
     *                 (not yet exposed in the UI).
     */
    scope: text('scope').notNull().default('note'),
    /** FK to `kinds.id` when scope='kind'; NULL otherwise. */
    kindId: text('kind_id').references(() => kinds.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
    /** FK to `notes.id` when scope='note'; NULL otherwise. */
    noteId: uuid('note_id').references(() => notes.id, {
      onDelete: 'cascade',
    }),
    /** FK to `databases.id` when scope='database'; NULL otherwise. */
    databaseId: uuid('database_id').references((): AnyPgColumn => databases.id, {
      onDelete: 'cascade',
    }),
    /** Stable, immutable identifier (slug derived from label). */
    key: text('key').notNull(),
    /** Display label (rename-safe). */
    label: text('label').notNull(),
    /** Property type: see `PropertyType` in shared. */
    type: text('type').notNull(),
    /** Optional icon name (UI hint). */
    icon: text('icon'),
    /** Optional human description. */
    description: text('description'),
    /** Type-specific configuration (select options, etc.). */
    config: jsonb('config').notNull().default({}),
    /** LexoRank string for stable ordering inside a kind. */
    position: text('position').notNull().default('a0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Postgres treats NULL as distinct in unique indexes, so the routes
    // layer enforces uniqueness for the all-NULL (global) bucket
    // separately. For scoped buckets, including the owner column in the
    // index keeps `(kind, key)` and `(note, key)` collisions out of the
    // database while still allowing the same `key` to appear under
    // different owners (which is exactly what per-note scope requires).
    uniqKey: uniqueIndex('property_definitions_scope_owner_key_uniq').on(
      t.scope,
      t.kindId,
      t.noteId,
      t.databaseId,
      t.key,
    ),
    kindIdx: index('property_definitions_kind_idx').on(t.kindId),
    noteIdx: index('property_definitions_note_idx').on(t.noteId),
    databaseIdx: index('property_definitions_database_idx').on(t.databaseId),
    positionIdx: index('property_definitions_position_idx').on(t.kindId, t.position),
    notePositionIdx: index('property_definitions_note_position_idx').on(
      t.noteId,
      t.position,
    ),
    databasePositionIdx: index('property_definitions_database_position_idx').on(
      t.databaseId,
      t.position,
    ),
  }),
);

/**
 * One value per (note, property). Storage is split across typed columns to
 * enable efficient indexed filtering by property type:
 *
 * - `valueText`   — text, longText, url, email, select (single option)
 * - `valueNumber` — number
 * - `valueBool`   — checkbox
 * - `valueDate`   — date
 * - `valueJson`   — multiSelect (`string[]`), dateRange (`{from,to}`),
 *                   relation (`string[]` of note ids)
 *
 * Exactly one column is populated for a given row (matching the property's
 * `type`). Empty/cleared values delete the row entirely; sparse storage
 * keeps the table lean.
 */
export const propertyValues = pgTable(
  'property_values',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    propertyId: uuid('property_id')
      .references(() => propertyDefinitions.id, { onDelete: 'cascade' })
      .notNull(),
    valueText: text('value_text'),
    valueNumber: doublePrecision('value_number'),
    valueBool: boolean('value_bool'),
    valueDate: timestamp('value_date', { withTimezone: true }),
    valueJson: jsonb('value_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqNoteProp: uniqueIndex('property_values_note_property_uniq').on(
      t.noteId,
      t.propertyId,
    ),
    noteIdx: index('property_values_note_idx').on(t.noteId),
    propertyIdx: index('property_values_property_idx').on(t.propertyId),
    filterTextIdx: index('property_values_filter_text_idx').on(t.propertyId, t.valueText),
    filterNumberIdx: index('property_values_filter_number_idx').on(
      t.propertyId,
      t.valueNumber,
    ),
    filterDateIdx: index('property_values_filter_date_idx').on(t.propertyId, t.valueDate),
  }),
);

/**
 * Notion-style Database — a persistent datasource that lives outside any
 * single note. Schema (property definitions with `scope='database'`) and
 * row membership (`database_rows`) hang off it via cascading FKs. Saved
 * views, however, live block-scoped in `database_block_views` — a
 * database is purely a row source.
 */
export const databases = pgTable('databases', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull().default(''),
  description: text('description'),
  icon: text('icon'),
  /**
   * Mirrors `notes.locked` semantics — when true, every schema / row /
   * cell mutation is rejected server-side with HTTP 423.
   */
  locked: boolean('locked').notNull().default(false),
  /** Hidden from default listings when true. Rows remain intact. */
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Saved view that belongs to a specific database block and points at a
 * specific datasource. Multiple views on the same block can target the
 * same or different datasources, each persisting its own filter / sort
 * / grouping / visibility / layout in `config` (jsonb).
 *
 * The block_id column is a plain text foreign key to the Tiptap node
 * attribute — there is no `blocks` table because blocks live inside the
 * note body JSON. Lifecycle is therefore managed cooperatively: views
 * are cleaned up on datasource delete (ON DELETE CASCADE on
 * `data_source_database_id`) and by the editor when the user removes
 * the block.
 */
export const databaseBlockViews = pgTable(
  'database_block_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockId: text('block_id').notNull(),
    dataSourceDatabaseId: uuid('data_source_database_id')
      .references(() => databases.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    /** `DatabaseViewType` from `@continuum/shared`. */
    type: text('type').notNull(),
    /** LexoRank string for stable ordering inside the block. */
    position: text('position').notNull().default('a0'),
    /**
     * `DatabaseViewConfig` (see `@continuum/shared`). Held as `jsonb`
     * because the shape grows per view type without altering the table.
     */
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    blockIdx: index('database_block_views_block_idx').on(t.blockId),
    positionIdx: index('database_block_views_position_idx').on(t.blockId, t.position),
    sourceIdx: index('database_block_views_source_idx').on(t.dataSourceDatabaseId),
  }),
);

/**
 * Membership row tying a Note to a Database. Rows are notes — every row
 * in a database is a full first-class note (own page, lock, tags, links,
 * graph). The unique index forbids the same note appearing twice in the
 * same database; a note may belong to multiple databases simultaneously.
 */
export const databaseRows = pgTable(
  'database_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    databaseId: uuid('database_id')
      .references(() => databases.id, { onDelete: 'cascade' })
      .notNull(),
    noteId: uuid('note_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    /** LexoRank string for stable manual ordering inside the database. */
    position: text('position').notNull().default('a0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    databaseIdx: index('database_rows_database_idx').on(t.databaseId),
    noteIdx: index('database_rows_note_idx').on(t.noteId),
    positionIdx: index('database_rows_position_idx').on(t.databaseId, t.position),
    uniqMembership: uniqueIndex('database_rows_database_note_uniq').on(
      t.databaseId,
      t.noteId,
    ),
  }),
);

/**
 * Reusable page template. Bundles editor body + property schema +
 * optional default values that can be applied to new or existing notes.
 *
 * Templates are intentionally NOT scoped by kind in a unique way: any
 * number of templates can target the same kind. The `targetKind` column
 * is a soft hint used to pre-select the kind picker; SET NULL on kind
 * delete keeps the template intact (the hint is simply forgotten).
 *
 * `version` is bumped server-side on every meaningful update (body or
 * properties) so `page_template_applications` rows can record which
 * revision was applied to which note.
 */
export const pageTemplates = pgTable(
  'page_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    /** Soft hint — SET NULL when the referenced kind is deleted. */
    targetKind: text('target_kind').references(() => kinds.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    content: text('content').notNull().default(''),
    contentJson: jsonb('content_json'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    /** Monotonic revision number; bumped on body / property mutations. */
    version: doublePrecision('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameIdx: index('page_templates_name_idx').on(t.name),
    targetKindIdx: index('page_templates_target_kind_idx').on(t.targetKind),
  }),
);

/**
 * Property definition carried by a {@link pageTemplates} row. Mirrors a
 * subset of `property_definitions` (label / type / icon / description /
 * config / position) plus an optional `default_value` JSON applied when
 * the template materialises this property onto a target note.
 *
 * `(template_id, key)` is unique so the slug remains a stable identifier
 * inside a template.
 */
export const templateProperties = pgTable(
  'template_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .references(() => pageTemplates.id, { onDelete: 'cascade' })
      .notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: text('type').notNull(),
    icon: text('icon'),
    description: text('description'),
    config: jsonb('config').notNull().default({}),
    /** Pre-filled value materialised onto the target note (nullable). */
    defaultValue: jsonb('default_value'),
    position: text('position').notNull().default('a0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    templateIdx: index('template_properties_template_idx').on(t.templateId),
    positionIdx: index('template_properties_position_idx').on(t.templateId, t.position),
    uniqKey: uniqueIndex('template_properties_template_key_uniq').on(t.templateId, t.key),
  }),
);

/**
 * Audit / provenance trail: one row per (note, template) apply. Records
 * which template revision was applied, what was actually merged, and any
 * non-fatal conflicts surfaced at the time. The `template_id` FK uses
 * SET NULL so deleting a template leaves the historical record intact.
 */
export const pageTemplateApplications = pgTable(
  'page_template_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    noteId: uuid('note_id')
      .references(() => notes.id, { onDelete: 'cascade' })
      .notNull(),
    templateId: uuid('template_id').references(() => pageTemplates.id, {
      onDelete: 'set null',
    }),
    /** Revision pinned at apply time (preserved even when template is later edited). */
    templateVersion: doublePrecision('template_version').notNull().default(1),
    /** Snapshot of how the note body was merged: 'append' | 'prepend' | 'replace' | 'none'. */
    appliedContent: text('applied_content').notNull().default('none'),
    /** Keys of properties materialised on the note by this apply. */
    appliedPropertyKeys: jsonb('applied_property_keys').$type<string[]>().notNull().default([]),
    /** Non-fatal warnings surfaced at apply time. Mirror of the API response. */
    conflicts: jsonb('conflicts').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    noteIdx: index('page_template_applications_note_idx').on(t.noteId),
    templateIdx: index('page_template_applications_template_idx').on(t.templateId),
  }),
);

export type NoteRow = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type KindRow = typeof kinds.$inferSelect;
export type NewKind = typeof kinds.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
export type PropertyDefinitionRow = typeof propertyDefinitions.$inferSelect;
export type NewPropertyDefinition = typeof propertyDefinitions.$inferInsert;
export type PropertyValueRow = typeof propertyValues.$inferSelect;
export type NewPropertyValue = typeof propertyValues.$inferInsert;
export type PageTemplateRow = typeof pageTemplates.$inferSelect;
export type NewPageTemplate = typeof pageTemplates.$inferInsert;
export type TemplatePropertyRow = typeof templateProperties.$inferSelect;
export type NewTemplateProperty = typeof templateProperties.$inferInsert;
export type PageTemplateApplicationRow = typeof pageTemplateApplications.$inferSelect;
export type NewPageTemplateApplication = typeof pageTemplateApplications.$inferInsert;
export type DatabaseRowEntity = typeof databases.$inferSelect;
export type NewDatabaseEntity = typeof databases.$inferInsert;
export type DatabaseViewRow = typeof databaseBlockViews.$inferSelect;
export type NewDatabaseView = typeof databaseBlockViews.$inferInsert;
export type DatabaseMembershipRow = typeof databaseRows.$inferSelect;
export type NewDatabaseMembership = typeof databaseRows.$inferInsert;
