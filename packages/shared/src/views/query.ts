// ===== Query request / response shapes for Database Views =====
//
// The query endpoint accepts a view in three flavours so callers can
// trade off persistence for ad-hoc tweaking:
//   1. Full materialised `DatabaseView` (preview unsaved changes).
//   2. `{ viewId }` reference to a persisted view (cheap, server-loaded).
//   3. `{ config }` ad-hoc DatabaseViewConfig without saving (e.g. AI tools).
//
// The response shape is built server-side and intentionally lacks a zod
// schema on this side — the server is the source of truth.

import { z } from 'zod';
import type { Note } from '../index.js';
import type { NoteProperty } from '../properties.js';
import { databaseViewSchema, databaseViewConfigSchema, type DatabaseView, type DatabaseViewConfig } from './view.js';
import type { CalcFnResult } from './calculation.js';

/** Server-imposed lower / default / upper bounds for `pageSize`. */
export const QUERY_PAGE_SIZE_DEFAULT = 50;
export const QUERY_PAGE_SIZE_MAX = 200;

/** Single query row: a note plus its hydrated property list. */
export interface NoteWithProperties {
  note: Note;
  properties: NoteProperty[];
}

/**
 * One of three view-spec discriminants accepted by {@link QueryRequest.view}.
 *
 *  - `DatabaseView`              — fully inlined view (no persistence lookup).
 *  - `{ viewId: string }`        — server loads the persisted view by id.
 *  - `{ config: DatabaseViewConfig }` — ad-hoc unsaved view config.
 */
export type QueryViewSpec =
  | DatabaseView
  | { viewId: string }
  | { config: DatabaseViewConfig };

/** Request payload for the database-view query endpoint. */
export interface QueryRequest {
  view: QueryViewSpec;
  /** Opaque cursor returned by the previous page. `null`/omitted = first page. */
  cursor?: string | null;
  /** Page size; clamped to `[1, QUERY_PAGE_SIZE_MAX]`. */
  pageSize?: number;
}

/** Group bucket descriptor returned alongside grouped query results. */
export interface QueryGroupBucket {
  /** Stable bucket key (option id, ISO date, note id, …). `null` for "empty". */
  key: string | null;
  /** Human label as the server resolved it (already translated/formatted). */
  label: string;
  /** Number of rows in this bucket across the whole result set. */
  count: number;
}

/** Response payload returned by the database-view query endpoint. */
export interface QueryResponse {
  rows: NoteWithProperties[];
  /** Cursor for the next page; `null` when no more rows. */
  nextCursor: string | null;
  /** Total row count matching the filter (across all pages). */
  total: number;
  /** Per-property-key calculation results, in the order requested by the view. */
  calc: Record<string, CalcFnResult>;
  /** Present when the view's `group` config produced bucketed results. */
  groups?: QueryGroupBucket[];
}

// ───────── Request schema ─────────

const queryViewSpecSchema: z.ZodType<QueryViewSpec> = z.union([
  databaseViewSchema,
  z.object({ viewId: z.string().uuid() }),
  z.object({ config: databaseViewConfigSchema }),
]);

/** Zod schema mirroring {@link QueryRequest}. */
export const queryRequestSchema = z.object({
  view: queryViewSpecSchema,
  cursor: z.string().nullish(),
  pageSize: z.number().int().min(1).max(QUERY_PAGE_SIZE_MAX).optional(),
});
