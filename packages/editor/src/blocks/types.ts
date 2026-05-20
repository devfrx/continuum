/**
 * Block platform — shared typings.
 *
 * The block registry is an additive layer on top of Tiptap. Each
 * `BlockDefinition` is a declarative descriptor for a custom block:
 * what Tiptap extension(s) back it, how it appears in the slash menu,
 * what generic actions it supports, and how its persisted attributes
 * may evolve over time.
 *
 * The contract is intentionally narrow: blocks remain pure Tiptap
 * nodes/extensions internally. The registry only adds metadata so the
 * editor shell can derive menus, drag-handle actions and developer
 * affordances from a single source of truth — instead of every block
 * being wired ad-hoc in `extensions.ts` and `slashCommandItems.ts`.
 */
import type { Editor, Extension, Mark, Node as TiptapNode, Range } from '@tiptap/core';

/**
 * Slash-menu sections used across the editor. Mirrors the existing
 * catalog so the registry can contribute commands that interleave
 * naturally with the native (paragraph/heading/list/divider/…) items
 * still owned by `slashCommandItems.ts`.
 */
export const SLASH_COMMAND_SECTIONS = ['Basic', 'Lists', 'Blocks', 'Insert'] as const;
export type SlashCommandSection = (typeof SLASH_COMMAND_SECTIONS)[number];

/**
 * High-level classification surfaced in the developer-facing block
 * inventory. Purely organisational — the runtime behaviour of a block
 * depends on its `capabilities`, not on its category.
 */
export type BlockCategory =
  /** Plain prose (paragraph, heading, blockquote). */
  | 'text'
  /** Wrapping containers with nestable block content (callout, details). */
  | 'container'
  /** Self-contained widgets with bespoke UI (chart, database). */
  | 'embed'
  /** Inline atoms living inside text (footnote, future mentions). */
  | 'inline-atom'
  /** Media-centric blocks (image, file, future video/audio). */
  | 'media'
  /** Data-driven blocks (database, future query/dashboard). */
  | 'data';

/**
 * Implementation maturity. `planned` blocks may register metadata so
 * they appear in inventories without yet being wired into the editor.
 */
export type BlockStatus = 'ready' | 'experimental' | 'planned';

/**
 * Capability flags read by generic editor affordances (drag-handle
 * menu, duplicate/delete commands, conversion menus). A block opts
 * into each capability explicitly so behaviour cannot be inferred
 * incorrectly from the underlying Tiptap node shape alone.
 */
export type BlockCapability =
  /** Top-level block may be dragged via the gutter handle. */
  | 'drag'
  /** Eligible for the generic "duplicate block" command. */
  | 'duplicate'
  /** Eligible for the generic "delete block" command. */
  | 'delete'
  /** Can participate in turn-into conversions (to/from paragraph). */
  | 'turn-into'
  /** Accepts nested block content as direct children. */
  | 'nest-blocks'
  /** Lives inline inside text (footnote, mention). */
  | 'inline'
  /** Requires a host-supplied NodeView component. */
  | 'host-required';

/**
 * Descriptor for a slash-menu entry contributed by a block.
 *
 * The shape matches `SlashCommandItem` (kept structurally identical so
 * the runtime menu can consume both registry-derived and ad-hoc items
 * without conversion).
 */
export interface BlockSlashDescriptor {
  /** Stable identifier (used as Vue `:key` and analytics handle). */
  id: string;
  /** Primary label shown in the menu (e.g. "Callout"). */
  title: string;
  /** Small secondary qualifier rendered beside the title (e.g. "Database"). */
  hint?: string;
  /** Single-line caption beneath the title. */
  description: string;
  /** Icon name resolved by the host icon catalog. */
  icon: string;
  /** Section header under which the item is grouped. */
  section: SlashCommandSection;
  /** Extra search terms in addition to title/description. */
  keywords?: readonly string[];
  /**
   * Insert the block. Implementations must clear the trigger range
   * (`editor.chain().focus().deleteRange(range)…`) so the `/query`
   * text is replaced rather than left in the document.
   */
  action: (args: { editor: Editor; range: Range }) => void;
}

/** Any Tiptap construct a block may register. */
export type BlockExtension = TiptapNode | Mark | Extension;

/**
 * Declarative definition of a custom editor block.
 *
 * One definition usually corresponds to one Tiptap node, but a block
 * may register multiple extensions when it ships with auxiliary nodes
 * (e.g. `Details` + `DetailsSummary` + `DetailsContent`).
 */
export interface BlockDefinition {
  /**
   * Tiptap node name (e.g. `'callout'`, `'database'`). Unique across
   * the registry and used as the primary lookup key.
   */
  type: string;
  /** Human-readable label for menus, tooltips and inventories. */
  label: string;
  /** Single-line caption surfaced in pickers and documentation. */
  description: string;
  /** Icon name resolved by the host icon catalog. */
  icon: string;
  /** Implementation status; `'planned'` blocks skip extension wiring. */
  status: BlockStatus;
  /** Logical bucket; lets host UIs group or filter blocks. */
  category: BlockCategory;
  /** Capability flags driving generic editor actions. */
  capabilities: ReadonlySet<BlockCapability>;
  /**
   * Persisted attribute-schema version. Bumped when the on-disk
   * attribute shape changes; callers may use it together with
   * `migrateAttrs` to upgrade legacy nodes lazily.
   */
  schemaVersion?: number;
  /**
   * Build the Tiptap extension(s) backing this block. Invoked once per
   * editor instance during `buildExtensions`. May return more than one
   * extension when the block ships with auxiliary nodes.
   *
   * Skipped entirely when `status === 'planned'`.
   */
  extensions: () => BlockExtension[];
  /**
   * Optional slash-menu descriptor. Omit for blocks that should not be
   * insertable from `/`.
   */
  slash?: BlockSlashDescriptor;
  /**
   * Lazily upgrade persisted attributes from an older `schemaVersion`
   * to the current one. The registry only stores the function;
   * invoking it (and persisting the result) is the caller's choice.
   */
  migrateAttrs?: (
    oldAttrs: Record<string, unknown>,
    fromVersion: number,
  ) => Record<string, unknown>;
}
