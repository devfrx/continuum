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
 * property (text, number, select, …) attached to a given scope. v1 only
 * exposes `scope='kind'` (per-kind properties) in the UI; `scope='global'`
 * is reserved for properties shared across every note.
 *
 * The `config` JSON column holds type-specific settings (e.g. select
 * options, number unit, relation target kind). See the discriminated union
 * `PropertyConfig` in `@continuum/shared` for the canonical shape.
 *
 * The `key` column is a slug derived once from the label, immutable, and
 * unique per `(scope, kind_id)`. The label is rename-safe.
 */
export const propertyDefinitions = pgTable(
  'property_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `'kind'` (per-kind) or `'global'` (every note). */
    scope: text('scope').notNull().default('kind'),
    /** FK to `kinds.id` when scope='kind'; NULL when scope='global'. */
    kindId: text('kind_id').references(() => kinds.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
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
    // layer enforces global-scope uniqueness separately.
    uniqKey: uniqueIndex('property_definitions_scope_kind_key_uniq').on(
      t.scope,
      t.kindId,
      t.key,
    ),
    kindIdx: index('property_definitions_kind_idx').on(t.kindId),
    positionIdx: index('property_definitions_position_idx').on(t.kindId, t.position),
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
