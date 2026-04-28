import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  vector,
  boolean,
  customType,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; default: false }>({
  dataType: () => 'bytea',
});

const EMB_DIM = Number(process.env.AI_EMBEDDING_DIMENSIONS ?? 768);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    kind: text('kind').notNull().default('note'),
    content: text('content').notNull().default(''),
    contentJson: jsonb('content_json'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    titleIdx: index('notes_title_idx').on(t.title),
    kindIdx: index('notes_kind_idx').on(t.kind),
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
