/**
 * Embedding pipeline for notes.
 *
 * Pure service module: every public function takes its dependencies (drizzle
 * client, AI provider manager) as parameters so the embedding logic can be
 * exercised in isolation. The only module-level state is a cached column
 * dimension used by the self-healing schema migration in
 * {@link ensureEmbeddingDimension} — it is intentionally process-wide so we
 * pay the `information_schema` lookup at most once per server process.
 */

import type { FastifyBaseLogger } from 'fastify';
import { sql as dsql } from 'drizzle-orm';
import type { ProviderManager } from '@continuum/ai-client';
import type { DB } from '../db/client.js';
import { embeddings } from '../db/schema.js';

/**
 * Minimum shape of a note row required to build embedding chunks.
 */
export interface EmbeddableNote {
  id: string;
  title: string;
  content: string;
  tags?: unknown;
  kind?: string;
}

/**
 * Strip HTML tags, wikilink brackets and collapse whitespace so the embedding
 * model sees clean prose instead of `<p><strong>...</strong></p>` markup.
 * Including raw markup massively dilutes cosine similarity against natural
 * language queries — short queries like "barbarian" end up with scores ~0.
 */
function normaliseForEmbedding(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the searchable header for a note: a short, dense string carrying
 * the highest-signal metadata (title, kind, tags). Indexed as its own
 * embedding chunk so that short queries that match the title or a tag
 * get a clean, undiluted similarity score instead of being averaged
 * against an entire long body.
 */
function buildHeaderChunk(n: { title: string; tags?: unknown; kind?: string }): string {
  const tags = Array.isArray(n.tags)
    ? (n.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const parts: string[] = [];
  if (n.title) parts.push(n.title);
  if (n.kind && n.kind !== 'note') parts.push(`(${n.kind})`);
  if (tags.length) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.join(' — ').trim();
}

/**
 * Split a long body into overlapping word-aware chunks. Each chunk is fed
 * to the embedding model independently so that a query can match a
 * specific paragraph instead of the average of the whole note. Overlap
 * preserves context across boundaries (e.g. a sentence that straddles
 * two chunks still appears whole in at least one).
 *
 * Tunables chosen for small-context local models (qwen3-0.6b handles 10k
 * tokens but cosine quality is best on ≈120-180 word chunks).
 */
function chunkBody(text: string): string[] {
  const cleaned = normaliseForEmbedding(text);
  if (!cleaned) return [];
  const TARGET = 700;   // ~120-150 words
  const OVERLAP = 120;  // ~20 words shared with the next chunk
  if (cleaned.length <= TARGET) return [cleaned];
  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    let end = Math.min(cleaned.length, i + TARGET);
    // Snap to the nearest word boundary so we never split a token.
    if (end < cleaned.length) {
      const sp = cleaned.lastIndexOf(' ', end);
      if (sp > i + TARGET / 2) end = sp;
    }
    chunks.push(cleaned.slice(i, end).trim());
    if (end >= cleaned.length) break;
    i = end - OVERLAP;
    if (i < 0) i = 0;
  }
  return chunks.filter((c) => c.length > 0);
}

/**
 * Cached actual dimension of the `embeddings.embedding` column. Resolved
 * lazily from `information_schema` on first use, then updated whenever
 * {@link ensureEmbeddingDimension} migrates the column.
 */
let cachedEmbeddingDim: number | null = null;

/**
 * Look up the current dimension of the `embedding` vector column.
 * pgvector exposes the declared dimension via `atttypmod` in `pg_attribute`
 * (the value stored is `dimensions + 4` for historical reasons; we read
 * the canonical `format_type` text instead, which always renders as
 * `vector(<n>)`).
 */
async function readColumnDim(db: DB): Promise<number | null> {
  const rows = (await db.execute(dsql`
    SELECT format_type(a.atttypid, a.atttypmod) AS t
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'embeddings' AND a.attname = 'embedding'
  `)) as unknown as Array<{ t: string }>;
  const t = rows[0]?.t ?? '';
  const m = /vector\((\d+)\)/.exec(t);
  return m ? Number(m[1]) : null;
}

/**
 * Ensure the `embedding` column dimension matches `actualDim`. If the
 * stored model produces a different vector length than the schema was
 * pushed with (common with LM Studio: nomic-embed=768, snowflake=384,
 * many small models=256), we recreate the column + HNSW index in place
 * and discard any rows already stored — they would be unreadable anyway.
 *
 * This makes the embedding pipeline self-healing: the user can swap
 * embedding models freely without ever running `db:push` manually.
 */
async function ensureEmbeddingDimension(
  db: DB,
  actualDim: number,
  log: FastifyBaseLogger,
): Promise<void> {
  if (cachedEmbeddingDim === actualDim) return;
  if (cachedEmbeddingDim === null) {
    cachedEmbeddingDim = await readColumnDim(db);
  }
  if (cachedEmbeddingDim === actualDim) return;

  log.warn(
    { from: cachedEmbeddingDim, to: actualDim },
    'embedding dimension mismatch — migrating column (existing embeddings will be cleared)',
  );

  // Drop dependent index first; ALTER COLUMN TYPE on a vector with a
  // different dimension cannot rebuild the HNSW index automatically.
  await db.execute(dsql`DROP INDEX IF EXISTS embeddings_vec_idx`);
  await db.execute(dsql`TRUNCATE TABLE embeddings`);
  await db.execute(
    dsql.raw(`ALTER TABLE embeddings ALTER COLUMN embedding TYPE vector(${actualDim})`),
  );
  await db.execute(
    dsql.raw(
      `CREATE INDEX embeddings_vec_idx ON embeddings USING hnsw (embedding vector_cosine_ops)`,
    ),
  );

  cachedEmbeddingDim = actualDim;
}

/**
 * Generate and persist embedding chunks for a single note.
 *
 * Builds one header chunk (title + kind + tags) plus N body chunks, then
 * embeds them in a single batched call. Auto-migrates the column dimension
 * on first call if the configured model's output size differs from the
 * current schema (see {@link ensureEmbeddingDimension}).
 *
 * Notes with no real signal (blank "Untitled" with no body) are skipped so
 * noise-floor vectors don't pollute the index.
 */
export async function embedNote(
  db: DB,
  ai: ProviderManager,
  n: EmbeddableNote,
  log: FastifyBaseLogger,
): Promise<void> {
  const header = buildHeaderChunk(n);
  const body = chunkBody(n.content ?? '');

  if (!header && body.length === 0) return;
  if (
    body.length === 0 &&
    (!n.title || /^untitled$/i.test(n.title.trim()))
  ) return;

  const chunks: string[] = [];
  if (header) chunks.push(header);
  for (const c of body) chunks.push(c);

  // Single batched embed call — most OpenAI-compatible servers accept an
  // array input and amortise the request overhead.
  const vecs = await ai.embed(chunks);
  if (!vecs.length || vecs[0].length === 0) return;

  await ensureEmbeddingDimension(db, vecs[0].length, log);

  log.info(
    { noteId: n.id, chunks: chunks.length, dim: vecs[0].length },
    'note embedded',
  );

  await db.insert(embeddings).values(
    vecs.map((v, idx) => ({
      noteId: n.id,
      chunk: chunks[idx].slice(0, 8000),
      embedding: v,
    })),
  );
}
