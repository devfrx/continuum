/**
 * Hybrid note search: semantic (pgvector) + lexical (ILIKE) with a
 * lexical bonus that rescues borderline semantic matches whose title or
 * tags literally contain the query string.
 *
 * Pure service module: the drizzle client and AI provider manager are
 * passed in so the search logic can be exercised independently of the
 * global singletons. Ranking thresholds live in
 * {@link ../services/search-ranking.ts} so they can be tuned without
 * touching the routing layer.
 */

import type { FastifyBaseLogger } from 'fastify';
import { sql as dsql } from 'drizzle-orm';
import type { ProviderManager } from '@continuum/ai-client';
import type { DB } from '../db/client.js';
import { embeddings, folders, notes } from '../db/schema.js';
import { descendantIds } from './folder-tree.js';
import {
  ABS_FLOOR,
  LEX_TAG_BONUS,
  LEX_TITLE_BONUS,
  REL_GAP,
} from './search-ranking.js';

/** A single ranked search result returned to the client. */
export interface SearchHit {
  id: string;
  title: string;
  kind: string;
  snippet: string;
  score: number;
  mode: 'semantic' | 'lexical';
}

/**
 * Parameters accepted by {@link searchNotes}. Mirrors the validated zod
 * schema in `routes/notes.ts` so the route handler can pass through after
 * parsing.
 */
export interface SearchNotesParams {
  query: string;
  limit: number;
  /** Optional folder scope; `null`/`undefined` means no scope. */
  folderId?: string | null;
  /** When `folderId` is set, include notes in descendant folders. */
  recursive: boolean;
}

/**
 * Run a hybrid search across the workspace's notes.
 *
 * Tries semantic search first (best chunk per note via pgvector) and
 * falls back to a pure ILIKE scan when no provider is reachable or the
 * semantic path returns no surviving hits. Title and tag literal matches
 * receive a bounded score bonus during the semantic path.
 */
export async function searchNotes(
  db: DB,
  ai: ProviderManager,
  params: SearchNotesParams,
  log: FastifyBaseLogger,
): Promise<SearchHit[]> {
  const { query, limit, folderId, recursive } = params;
  const qLower = query.toLowerCase();

  // Resolve folder scope to a concrete set of folder ids (or null = no scope).
  // Done once per request so both the semantic and lexical paths reuse it.
  let scopeIds: string[] | null = null;
  if (folderId) {
    if (recursive) {
      const all = await db.select().from(folders);
      scopeIds = descendantIds(folderId, all);
    } else {
      scopeIds = [folderId];
    }
  }
  const scopeSql = scopeIds
    ? dsql`AND n.folder_id = ANY(${`{${scopeIds.join(',')}}`}::uuid[])`
    : dsql``;

  let semanticHits: SearchHit[] = [];
  try {
    const [vec] = await ai.embed(query);
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0));
    log.info({ dim: vec.length, norm }, 'query embedding');
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
        WHERE 1 = 1 ${scopeSql}
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
      if (titleHit) score = Math.min(1, score + LEX_TITLE_BONUS);
      else if (tagHit) score = Math.min(1, score + LEX_TAG_BONUS);
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

    log.info(
      { query, top: semanticHits.slice(0, 5).map((h) => ({ t: h.title, s: h.score })) },
      'semantic search scores',
    );

    // Filter the noise floor: small embedding models have a baseline
    // similarity (~0.3-0.5) between any two random texts. Only relative
    // gaps carry signal, so drop hits more than REL_GAP below the top
    // score and anything below ABS_FLOOR.
    if (semanticHits.length > 0) {
      const topScore = semanticHits[0].score;
      semanticHits = semanticHits
        .filter((h) => h.score >= ABS_FLOOR && h.score >= topScore - REL_GAP)
        .slice(0, limit);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ msg }, 'semantic search unavailable, falling back to lexical');
  }

  if (semanticHits.length > 0) return semanticHits;

  // Lexical fallback (ILIKE on title/content), title matches ranked first.
  const lexRows = await db.execute(dsql`
    SELECT id, title, kind, substring(content, 1, 240) AS snippet,
           0::float AS score
    FROM ${notes} n
    WHERE (title ILIKE '%' || ${query} || '%' OR content ILIKE '%' || ${query} || '%')
          ${scopeSql}
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
}
