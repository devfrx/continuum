// ===== Domain types shared between server, web, and desktop =====

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

export interface Note {
  id: UUID;
  title: string;
  kind: EntityKind;
  content: string; // markdown / JSON depending on editor mode
  contentJson?: unknown; // TipTap JSON
  tags: string[];
  /** Optional parent folder. `null` = root ("Inbox"). */
  folderId?: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface GraphNode {
  id: UUID;
  label: string;
  kind: EntityKind;
}

export interface GraphEdge {
  id: UUID;
  source: UUID;
  target: UUID;
  type: string;
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
