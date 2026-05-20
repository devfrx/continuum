// ===== Domain types shared between server, web, and desktop =====

export { lockContinuumScroll, SCROLL_LOCK_ALLOW_ATTRIBUTE } from './scrollLock.js';

export type UUID = string;

/**
 * A note category. `'note'` is the only built-in default; all other kinds are
 * user-created and persisted in the `kinds` table. The type is intentionally
 * open (just `string`) because categories are dynamic at runtime.
 */
export type EntityKind = string;

/**
 * A category definition stored server-side. Drives label, color and icon used
 * across the editor, sidebar and graph view.
 */
export interface KindDefinition {
  /** Slug — lowercase, kebab-case, unique. Stored as the FK in `notes.kind`. */
  id: string;
  /** Display label, shown in UI. */
  label: string;
  /** Hex color (`#RRGGBB`) for graph nodes & UI dots. */
  color: string;
  /** Icon name from the central `Icon` component (e.g. `'kind-character'`). */
  icon: string;
  /** Optional description shown in management UI. */
  description?: string;
  /** True for system-defined kinds the user cannot delete (only `'note'`). */
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverPosition {
  /** Horizontal focal point, expressed as a CSS percentage from 0 to 100. */
  x: number;
  /** Vertical focal point, expressed as a CSS percentage from 0 to 100. */
  y: number;
}

export interface Note {
  id: UUID;
  title: string;
  kind: EntityKind;
  content: string; // markdown / JSON depending on editor mode
  contentJson?: unknown; // TipTap JSON
  tags: string[];
  /** Optional parent folder. `null` = root ("Inbox"). */
  folderId?: UUID | null;
  /**
   * When true, the note is "finalized" and read-only across the stack.
   * The editor disables all editing affordances and the API rejects every
   * mutation except toggling `locked` itself. Set via the lock toggle in
   * the note header.
   */
  locked: boolean;
  /**
   * Optional cover image URL (relative `/uploads/...` or absolute).
   * Shown above the editor and consumed by Gallery views as the card
   * header when present. `null` means "no cover".
   */
  coverImage?: string | null;
  /** Optional cover focal point used by the editor, board and gallery cards. */
  coverPosition?: CoverPosition | null;
  createdAt: string;
  updatedAt: string;
}

export interface GraphNode {
  id: UUID;
  label: string;
  kind: EntityKind;
  /**
   * Folder the note belongs to (`null` = root / Inbox). Populated only by
   * the `POST /api/graph/query` endpoint so existing graph callers that
   * load the legacy lightweight payload keep working unchanged.
   */
  folderId?: UUID | null;
  /**
   * Note tags. Populated only by the new graph-query endpoint when the
   * caller filters on or projects `note.tags`.
   */
  tags?: string[];
  /**
   * ISO-8601 creation timestamp. Populated only by the new graph-query
   * endpoint; absent on legacy graph payloads.
   */
  createdAt?: string;
  /**
   * ISO-8601 last-updated timestamp. Populated only by the new graph-query
   * endpoint; absent on legacy graph payloads.
   */
  updatedAt?: string;
  /**
   * Mirror of `Note.locked`. Populated only by the new graph-query
   * endpoint so visual encodings (badges) and filters can react to lock
   * state without an extra round-trip. Absent on legacy graph payloads.
   */
  locked?: boolean;
  /**
   * Materialised property snapshots — present only when the request asked
   * for them via `GraphQueryRequest.includeProperties`. Order matches the
   * `includeProperties` array so the client can render columns predictably.
   */
  properties?: import('./query/graph.js').GraphPropertySnapshot[];
  /**
   * Graph metrics (degree / inDegree / outDegree) — present only when the
   * request set `includeMetrics: true`. Computed at request time, never
   * persisted.
   */
  metrics?: import('./query/graph.js').GraphNodeMetrics;
}

export interface GraphEdge {
  id: UUID;
  source: UUID;
  target: UUID;
  type: string;
  /**
   * Where this edge came from. Populated only by the new graph-query
   * endpoint so the client can style and filter edges by origin without a
   * second round-trip.
   */
  sourceKind?: import('./query/graph.js').GraphEdgeSourceKind;
  /**
   * Originating relation-property key. Present only when
   * `sourceKind === 'relationProperty'`. Carries the canonical key
   * (rather than a per-note definition id) so the client groups edges
   * by logical relation, not by storage row.
   */
  propertyKey?: string;
}

// ===== AI types =====

export type AiProviderName = 'lmstudio' | 'ollama';

export interface AiModelInfo {
  id: string;
  provider: AiProviderName;
  object?: string;
  ownedBy?: string;
}

export interface AiProviderStatus {
  name: AiProviderName;
  baseUrl: string;
  reachable: boolean;
  models?: AiModelInfo[];
  error?: string;
}

export interface AiHealthResponse {
  primary: AiProviderName;
  fallback: AiProviderName;
  providers: AiProviderStatus[];
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  stream?: boolean;
}

export interface AiSearchHit {
  id: UUID;
  title: string;
  snippet: string;
  score: number;
}

// ===== UI primitives =====

/**
 * Generic contextual-menu item shared across packages so the editor (which
 * cannot import `apps/web`) can emit menu requests that the host renders
 * via the `UiContextMenu` primitive.
 *
 * `icon` is loosely typed as `string` here; the web app narrows it to its
 * `IconName` union at the rendering boundary.
 */
export interface ContextMenuItem {
  id: string;
  label?: string;
  icon?: string;
  shortcut?: string;
  divider?: boolean;
  header?: boolean;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  swatch?: string;
  children?: ContextMenuItem[];
  onSelect?: () => void;
}

// ===== Folders =====

/**
 * Hierarchical folder used to organise notes. Folders form a tree (single
 * parent) and propagate three optional defaults to their descendants:
 *
 * - `defaultKind` — the `EntityKind` newly-created notes inherit when no
 *   explicit kind is chosen.
 * - `icon` — icon shown next to the folder name and used as fallback for
 *   notes that don't override it.
 * - `color` — hex colour used in the sidebar tree, breadcrumb, and graph.
 *
 * Inheritance follows **Modality B** (parent inheritance with override):
 * if a field is `null` on a folder, its effective value is resolved by
 * walking up the tree to the nearest ancestor that defines it. Setting a
 * field at any depth overrides the inherited value for that subtree.
 */
export interface Folder {
  id: UUID;
  /** Parent folder id; `null` for top-level folders. */
  parentId: UUID | null;
  /** Display name. */
  name: string;
  /** URL-safe slug, unique per parent. */
  slug: string;
  /**
   * LexoRank-style fractional rank used for stable ordering within the same
   * parent. Stored as text so inserts between two siblings never require a
   * full re-numbering.
   */
  position: string;
  /** Default kind newly-created notes inherit. `null` = inherit from parent. */
  defaultKind: EntityKind | null;
  /** Icon name. `null` = inherit from parent. */
  icon: string | null;
  /** Hex colour `#RRGGBB`. `null` = inherit from parent. */
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Folder enriched with its children for tree rendering. The server returns
 * a forest of `FolderNode` rooted at top-level folders.
 */
export interface FolderNode extends Folder {
  children: FolderNode[];
  /** Number of notes directly contained (not including descendants). */
  noteCount: number;
}

/**
 * Effective (inherited) values for a folder, computed by walking up the
 * tree. Every field is non-null and represents what the UI should actually
 * show / what new notes should default to.
 */
export interface FolderEffective {
  defaultKind: EntityKind;
  icon: string;
  color: string;
}

/**
 * Project-wide fallback applied when no ancestor folder defines a value.
 * Single source of truth shared by the server (`folder-tree.ts`) and the
 * web client (`useFolders`) so both sides agree on what an "Inbox" note or
 * a top-level folder inherits when none of its ancestors set a default.
 */
export const ROOT_FALLBACK: FolderEffective = {
  defaultKind: 'note',
  icon: 'folder',
  color: '#8C7B6A',
};

// ===== Wikilinks =====

/**
 * Canonical wikilink syntax: `[[Title]]` / `[[Title|alias]]`. A leading
 * backslash escapes the link (group 1), the inner payload is captured by
 * group 2. The pattern uses the `g` flag and therefore carries `lastIndex`
 * state — call {@link getWikilinkPattern} to obtain a fresh instance per
 * call site instead of sharing a module-level constant.
 */
export function getWikilinkPattern(): RegExp {
  return /(\\)?\[\[([^\n]+?)\]\]/g;
}

/**
 * Extract unique wikilink target titles from a body of text.
 *
 * - Strips any `|alias` portion.
 * - Trims whitespace inside the brackets.
 * - Deduplicates case-insensitively while preserving the casing of the
 *   first occurrence so display in UI stays natural.
 * - Skips occurrences preceded by a backslash (escaped wikilinks).
 *
 * @param content Raw note content (markdown / plain text).
 * @returns Ordered list of unique titles referenced by the content.
 */
export function extractWikilinkTargets(content: string): string[] {
  if (!content) return [];
  const seen = new Map<string, string>(); // lower -> first-seen casing
  for (const match of content.matchAll(getWikilinkPattern())) {
    const [, escape, inner] = match;
    if (escape) continue;
    const title = inner.split('|', 1)[0]?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (!seen.has(key)) seen.set(key, title);
  }
  return Array.from(seen.values());
}

// ===== Kind colours =====

/**
 * Default per-kind colour palette — **single source of truth** consumed by:
 *
 * - The web client as the runtime fallback when no `Kind` record provides an
 *   explicit colour (graph nodes, sidebar dots, backlinks/linked-notes
 *   panels, embedders of `@continuum/graph` without the `useKinds`
 *   composable).
 * - The server seed (`server/src/db/seed.ts`), which imports this map and
 *   uses it for the `color` column when populating the `kinds` table on a
 *   fresh database. Existing rows in `kinds` are never rewritten from this
 *   map — only first-install defaults derive from it.
 *
 * Keep this map and the kind id list in `server/src/db/seed.ts` in sync;
 * any kind id that appears in the seed must have an entry here.
 */
export const KIND_COLORS: Record<string, string> = {
  note: '#8C7B6A',
  character: '#C96E4A',
  race: '#7A9E7E',
  class: '#D4A24C',
  location: '#5B7B95',
  item: '#A87CA0',
  faction: '#B5563E',
  event: '#6B8E8E',
  lore: '#A89580',
  custom: '#9A9286',
};

/** Resolve a kind id to its fallback colour, defaulting to `custom`. */
export function colorForKind(kind: string): string {
  return KIND_COLORS[kind] ?? KIND_COLORS.custom;
}

// ===== Custom Properties =====
export * from './properties.js';

// ===== Page Templates =====
export * from './templates.js';

// ===== Databases (Notion-like) =====
export * from './databases.js';

// ===== Query layer =====
export * from './query/index.js';

