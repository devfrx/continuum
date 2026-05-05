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

export type NoteRow = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type KindRow = typeof kinds.$inferSelect;
export type NewKind = typeof kinds.$inferInsert;
export type FolderRow = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
