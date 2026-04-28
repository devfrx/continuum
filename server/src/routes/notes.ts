import type { FastifyPluginAsync, FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, embeddings, links } from '../db/schema.js';
import { aiManager } from '../ai/manager.js';
import { extractWikilinks } from '../lib/wikilinks.js';

const upsertSchema = z.object({
  title: z.string().min(1),
  kind: z.string().default('note'),
  content: z.string().default(''),
  contentJson: z.unknown().optional(),
  tags: z.array(z.string()).default([]),
});

/**
 * PUT accepts a partial — clients (e.g. Rename) may want to update only
 * the title without resetting content/kind/tags to their defaults.
 */
const partialUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  kind: z.string().optional(),
  content: z.string().optional(),
  contentJson: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
});

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
});

const idParamSchema = z.object({ id: z.string().uuid() });

interface SearchHit {
  id: string;
  title: string;
  kind: string;
  snippet: string;
  score: number;
  mode: 'semantic' | 'lexical';
}

export const noteRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async () => db.select().from(notes).orderBy(notes.updatedAt));

  app.get('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [n] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    if (!n) return reply.notFound('Note not found');
    return n;
  });

  app.post('/', async (req) => {
    const body = upsertSchema.parse(req.body);
    const [created] = await db.insert(notes).values(body).returning();

    // fire-and-forget embedding generation
    void embedNote(created, app.log).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unreachable/i.test(msg)) app.log.warn({ msg }, 'embedding skipped (no AI provider)');
      else app.log.error({ err: e }, 'embed failed');
    });

    // fire-and-forget wikilink synchronisation
    void syncWikilinks(created.id, created.content, app.log).catch((err) => {
      app.log.warn({ err }, 'wikilink sync failed');
    });

    return created;
  });

  app.put('/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = partialUpdateSchema.parse(req.body);
    if (Object.keys(body).length === 0) return reply.badRequest('Empty update');
    const [updated] = await db
      .update(notes)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();
    if (!updated) return reply.notFound('Note not found');

    // refresh embeddings only when the textual content actually changed
    if (body.content !== undefined || body.title !== undefined || body.tags !== undefined) {
      await db.delete(embeddings).where(eq(embeddings.noteId, id));
      void embedNote(updated, app.log).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/unreachable/i.test(msg)) app.log.warn({ msg }, 'embedding skipped (no AI provider)');
        else app.log.error({ err: e }, 'embed failed');
      });
    }

    // refresh wikilinks only when content changed
    if (body.content !== undefined) {
      void syncWikilinks(id, updated.content, app.log).catch((err) => {
        app.log.warn({ err }, 'wikilink sync failed');
      });
    }

    return updated;
  });

  app.delete('/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    await db.delete(notes).where(eq(notes.id, id));
    return { ok: true };
  });

  /**
   * Rebuild embeddings for every note. Useful when the embedding pipeline
   * changes (new model, new normalisation, dimension migration) and the
   * stored vectors no longer reflect the current logic. Runs sequentially
   * to avoid hammering the local AI provider.
   */
  app.post('/reindex', async () => {
    const all = await db.select({ id: notes.id, title: notes.title, content: notes.content, tags: notes.tags, kind: notes.kind }).from(notes);
    await db.delete(embeddings);
    let ok = 0;
    let failed = 0;
    for (const n of all) {
      try {
        await embedNote(n, app.log);
        ok += 1;
      } catch (err) {
        failed += 1;
        app.log.warn({ err, noteId: n.id }, 'reindex: embed failed');
      }
    }
    return { total: all.length, ok, failed };
  });

  // Backlinks: notes that link TO :id (any link type, wikilink or related).
  app.get('/:id/backlinks', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const [target] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(eq(notes.id, id))
      .limit(1);
    if (!target) return reply.notFound('Note not found');

    return db
      .select({
        id: notes.id,
        title: notes.title,
        kind: notes.kind,
        snippet: dsql<string>`substring(${notes.content}, 1, 240)`,
        type: links.type,
      })
      .from(links)
      .innerJoin(notes, eq(notes.id, links.sourceId))
      .where(eq(links.targetId, id));
  });

  // Hybrid search: semantic via embeddings (best chunk per note) plus a
  // small lexical bonus when the literal query string appears in the
  // title or a tag. Falls back to pure ILIKE when no provider is reachable.
  app.post('/search', async (req) => {
    const { query, limit } = searchSchema.parse(req.body);
    const qLower = query.toLowerCase();

    let semanticHits: SearchHit[] = [];
    try {
      const [vec] = await aiManager.embed(query);
      const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
      app.log.info({ dim: vec.length, norm }, 'query embedding');
      const vecLiteral = `[${vec.join(',')}]`;

      // DISTINCT ON (note_id) keeps only the best-scoring chunk per note.
      // We over-fetch (limit * 4) so the post-filter / lexical rerank
      // doesn't truncate the candidate set prematurely.
      const overFetch = Math.max(limit * 4, 20);
      const rows = await db.execute(dsql`
        SELECT id, title, kind, tags, snippet, score FROM (
          SELECT DISTINCT ON (n.id)
            n.id,
            n.title,
            n.kind,
            n.tags,
            substring(e.chunk, 1, 240) AS snippet,
            1 - (e.embedding <=> ${vecLiteral}::vector) AS score,
            e.embedding <=> ${vecLiteral}::vector AS dist
          FROM ${embeddings} e
          JOIN ${notes} n ON n.id = e.note_id
          ORDER BY n.id, dist ASC
        ) s
        ORDER BY score DESC
        LIMIT ${overFetch}
      `);

      semanticHits = (rows as unknown as Array<{
        id: string;
        title: string;
        kind: string;
        tags: unknown;
        snippet: string | null;
        score: number | string;
      }>).map((r) => {
        let score = Number(r.score) || 0;
        // Lexical bonus: literal query in title or any tag boosts confidence.
        // Capped so the boost can rescue a borderline match but never invents
        // relevance from nothing.
        const titleHit = (r.title ?? '').toLowerCase().includes(qLower);
        const tagHit = Array.isArray(r.tags)
          ? (r.tags as unknown[]).some(
              (t) => typeof t === 'string' && t.toLowerCase().includes(qLower),
            )
          : false;
        if (titleHit) score = Math.min(1, score + 0.2);
        else if (tagHit) score = Math.min(1, score + 0.12);
        return {
          id: r.id,
          title: r.title,
          kind: r.kind,
          snippet: r.snippet ?? '',
          score,
          mode: 'semantic' as const,
        };
      });
      semanticHits.sort((a, b) => b.score - a.score);

      app.log.info(
        { query, top: semanticHits.slice(0, 5).map((h) => ({ t: h.title, s: h.score })) },
        'semantic search scores',
      );

      // Filter the noise floor: small embedding models have a baseline
      // similarity (~0.3-0.5) between any two random texts. Only relative
      // gaps carry signal, so drop hits more than 0.18 below the top score
      // and anything below an absolute floor of 0.30.
      if (semanticHits.length > 0) {
        const topScore = semanticHits[0].score;
        const ABS_FLOOR = 0.3;
        const REL_GAP = 0.18;
        semanticHits = semanticHits
          .filter((h) => h.score >= ABS_FLOOR && h.score >= topScore - REL_GAP)
          .slice(0, limit);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      app.log.warn({ msg }, 'semantic search unavailable, falling back to lexical');
    }

    if (semanticHits.length > 0) return semanticHits;

    // Lexical fallback (ILIKE on title/content), title matches ranked first.
    const lexRows = await db.execute(dsql`
      SELECT id, title, kind, substring(content, 1, 240) AS snippet,
             0::float AS score
      FROM ${notes}
      WHERE title ILIKE '%' || ${query} || '%' OR content ILIKE '%' || ${query} || '%'
      ORDER BY (CASE WHEN title ILIKE '%' || ${query} || '%' THEN 0 ELSE 1 END), updated_at DESC
      LIMIT ${limit}
    `);

    return (lexRows as unknown as Array<{
      id: string;
      title: string;
      kind: string;
      snippet: string | null;
    }>).map<SearchHit>((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      snippet: r.snippet ?? '',
      score: 0,
      mode: 'lexical',
    }));
  });
};

/**
 * Cached actual dimension of the `embeddings.embedding` column. Resolved
 * lazily from `information_schema` on first use, then updated whenever
 * `ensureEmbeddingDimension()` migrates the column.
 */
let cachedEmbeddingDim: number | null = null;

/**
 * Look up the current dimension of the `embedding` vector column.
 * pgvector exposes the declared dimension via `atttypmod` in `pg_attribute`
 * (the value stored is `dimensions + 4` for historical reasons; we read
 * the canonical `format_type` text instead, which always renders as
 * `vector(<n>)`).
 */
async function readColumnDim(): Promise<number | null> {
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
  actualDim: number,
  log: FastifyBaseLogger,
): Promise<void> {
  if (cachedEmbeddingDim === actualDim) return;
  if (cachedEmbeddingDim === null) {
    cachedEmbeddingDim = await readColumnDim();
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
 * Generate and persist a single embedding chunk for a note.
 * Naive single-chunk embed; production would split text into ~512-token chunks.
 *
 * Auto-migrates the column dimension on first call if the configured
 * model's output size differs from the current schema (see
 * `ensureEmbeddingDimension`).
 */
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
function buildHeaderChunk(n: {
  title: string;
  tags?: unknown;
  kind?: string;
}): string {
  const tags = Array.isArray(n.tags) ? (n.tags as string[]).filter((t) => typeof t === 'string') : [];
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

async function embedNote(
  n: { id: string; title: string; content: string; tags?: unknown; kind?: string },
  log: FastifyBaseLogger,
): Promise<void> {
  const header = buildHeaderChunk(n);
  const body = chunkBody(n.content ?? '');

  // Skip notes with no real signal (e.g. blank "Untitled") so noise-floor
  // vectors don't pollute the index.
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
  const vecs = await aiManager.embed(chunks);
  if (!vecs.length || vecs[0].length === 0) return;

  await ensureEmbeddingDimension(vecs[0].length, log);

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

/**
 * Synchronise `links` rows of type `wikilink` for a given source note.
 *
 * Replaces the full set of wikilink edges originating from `noteId` with the
 * ones currently present in `content`. Self-links and unresolved titles are
 * skipped. Other link types (e.g. `related`) are left untouched.
 */
async function syncWikilinks(
  noteId: string,
  content: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const titles = extractWikilinks(content);

  // Always clear previous wikilink edges for this source so deletions propagate.
  await db.delete(links).where(and(eq(links.sourceId, noteId), eq(links.type, 'wikilink')));

  if (titles.length === 0) return;

  const allNotes = await db.select({ id: notes.id, title: notes.title }).from(notes);
  const byTitle = new Map<string, string>();
  for (const n of allNotes) byTitle.set(n.title.toLowerCase(), n.id);

  const rows: Array<{ sourceId: string; targetId: string; type: string }> = [];
  for (const t of titles) {
    const targetId = byTitle.get(t.toLowerCase());
    if (!targetId || targetId === noteId) continue;
    rows.push({ sourceId: noteId, targetId, type: 'wikilink' });
  }

  if (rows.length === 0) {
    log.debug({ noteId, titles }, 'no wikilink targets resolved');
    return;
  }

  await db.insert(links).values(rows);
}
