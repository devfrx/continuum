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
