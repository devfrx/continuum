/**
 * Built-in block definitions.
 *
 * Wraps every custom Tiptap node that ships with the editor in a
 * `BlockDefinition` so they participate in the registry. Slash-menu
 * descriptors are exported separately as pure data (`BUILTIN_BLOCK_SLASH`)
 * so the default command catalog can be composed without instantiating
 * any Tiptap extension or Vue component.
 *
 * Order of responsibilities:
 *   - This module knows about the editor's custom nodes (Callout,
 *     legacy Chart, Database, Details, Footnote, CodeBlockLowlight).
 *   - It does NOT know about StarterKit-native blocks (paragraph,
 *     heading, list, quote, divider, table, image) — those remain wired
 *     directly in `extensions.ts` and `slashCommandItems.ts`.
 *   - It does NOT know about decoration-only extensions (Mathematics,
 *     WikilinkDecoration, TableOfContents, SlashCommand).
 */
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import type { Component } from 'vue';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {
  createDatabaseBlockAttrs,
  type DatabaseBlockInitialView,
  type DatabaseViewConfig,
  type DatabaseViewType,
} from '@continuum/shared';
import { Callout } from '../nodes/Callout';
import { Chart } from '../nodes/Chart';
import { Database } from '../nodes/Database';
import { Details, DetailsSummary, DetailsContent } from '../nodes/Details';
import { Footnote } from '../nodes/Footnote';
import { lowlight } from '../codeLanguages';
import type {
  BlockCapability,
  BlockDefinition,
  BlockExtension,
  BlockSlashDescriptor,
} from './types';

/**
 * Host-supplied Vue components used as NodeViews for the built-in
 * blocks. The shape mirrors the existing `BuildOptions` fields so
 * `extensions.ts` can forward them unchanged.
 */
export interface BuiltinBlockViews {
  /** NodeView for the code-block (language picker + syntax highlight). */
  codeBlockView: Component;
  /** NodeView for the Toggle/Details block. */
  detailsView: Component;
  /** NodeView for the Callout block (icon picker). */
  calloutView: Component;
  /** NodeView for legacy standalone Chart blocks already present in documents. */
  chartView: Component;
  /**
   * NodeView for the Database block. Optional: when missing, the
   * Database node still registers (so existing documents parse) but
   * falls back to its default "missing host" rendering.
   */
  databaseView?: Component;
  /** NodeView for the inline Footnote atom. */
  footnoteView: Component;
}

/** Convenience helper: read-only set with the supplied capabilities. */
const caps = (...c: BlockCapability[]): ReadonlySet<BlockCapability> => new Set(c);

function newBlockId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function databaseViewBlockCommand(input: {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: DatabaseViewType;
  keywords: readonly string[];
  name?: string;
  config?: Partial<DatabaseViewConfig>;
}): BlockSlashDescriptor {
  return {
    id: input.id,
    title: input.title,
    hint: 'Database',
    description: input.description,
    icon: input.icon,
    section: 'Insert',
    keywords: ['database', 'datasource', 'view', ...input.keywords],
    action: ({ editor, range }) => {
      const initialView: DatabaseBlockInitialView = {
        type: input.type,
        name: input.name ?? input.title,
        ...(input.config ? { config: input.config } : {}),
      };
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'database',
          attrs: createDatabaseBlockAttrs(newBlockId(), initialView),
        })
        .run();
    },
  };
}

/** Database-backed layouts exposed directly in the slash menu. */
export const DATABASE_VIEW_BLOCK_SLASH: readonly BlockSlashDescriptor[] = [
  databaseViewBlockCommand({
    id: 'database-table-view',
    title: 'Table view',
    description: 'Rows and columns backed by a datasource.',
    icon: 'view-table',
    type: 'table',
    keywords: ['table', 'rows', 'columns', 'grid'],
    name: 'Table',
  }),
  databaseViewBlockCommand({
    id: 'database-board-view',
    title: 'Board view',
    description: 'Kanban grouped by a database property.',
    icon: 'view-board',
    type: 'board',
    keywords: ['board', 'kanban', 'group', 'status'],
    name: 'Board',
  }),
  databaseViewBlockCommand({
    id: 'database-gallery-view',
    title: 'Gallery view',
    description: 'Card grid backed by a datasource.',
    icon: 'view-gallery',
    type: 'gallery',
    keywords: ['gallery', 'cards', 'images'],
    name: 'Gallery',
  }),
  databaseViewBlockCommand({
    id: 'database-list-view',
    title: 'List view',
    description: 'Compact rows backed by a datasource.',
    icon: 'view-list',
    type: 'list',
    keywords: ['list', 'rows'],
    name: 'List',
  }),
  databaseViewBlockCommand({
    id: 'database-feed-view',
    title: 'Feed view',
    description: 'Reverse-chronological database entries.',
    icon: 'view-feed',
    type: 'feed',
    keywords: ['feed', 'timeline', 'entries'],
    name: 'Feed',
  }),
  databaseViewBlockCommand({
    id: 'database-dashboard-view',
    title: 'Dashboard view',
    description: 'Dashboard layout for a datasource.',
    icon: 'view-dashboard',
    type: 'dashboard',
    keywords: ['dashboard', 'metrics', 'panels'],
    name: 'Dashboard',
  }),
  databaseViewBlockCommand({
    id: 'database-calendar-view',
    title: 'Calendar view',
    description: 'Date-based database calendar.',
    icon: 'view-calendar',
    type: 'calendar',
    keywords: ['calendar', 'date', 'schedule'],
    name: 'Calendar',
  }),
  databaseViewBlockCommand({
    id: 'database-timeline-view',
    title: 'Timeline view',
    description: 'Rows placed across a date range.',
    icon: 'view-timeline',
    type: 'timeline',
    keywords: ['timeline', 'date range', 'schedule'],
    name: 'Timeline',
  }),
  databaseViewBlockCommand({
    id: 'database-map-view',
    title: 'Map view',
    description: 'Map layout for a datasource.',
    icon: 'view-map',
    type: 'map',
    keywords: ['map', 'location'],
    name: 'Map',
  }),
  databaseViewBlockCommand({
    id: 'database-vertical-bar-chart',
    title: 'Vertical bar chart',
    description: 'Grouped count chart backed by database rows.',
    icon: 'view-chart',
    type: 'chart',
    keywords: ['chart', 'bar', 'vertical', 'graph'],
    name: 'Bar chart',
    config: { layout: { chartType: 'bar', aggregation: 'count' } },
  }),
  databaseViewBlockCommand({
    id: 'database-horizontal-bar-chart',
    title: 'Horizontal bar chart',
    description: 'Horizontal grouped chart backed by database rows.',
    icon: 'view-chart',
    type: 'chart',
    keywords: ['chart', 'bar', 'horizontal', 'graph'],
    name: 'Horizontal bar chart',
    config: { layout: { chartType: 'horizontalBar', aggregation: 'count' } },
  }),
  databaseViewBlockCommand({
    id: 'database-line-chart',
    title: 'Line chart',
    description: 'Trend chart backed by database rows.',
    icon: 'view-chart',
    type: 'chart',
    keywords: ['chart', 'line', 'trend', 'graph'],
    name: 'Line chart',
    config: { layout: { chartType: 'line', aggregation: 'count' } },
  }),
  databaseViewBlockCommand({
    id: 'database-area-chart',
    title: 'Area chart',
    description: 'Filled trend chart backed by database rows.',
    icon: 'view-chart',
    type: 'chart',
    keywords: ['chart', 'area', 'trend', 'graph'],
    name: 'Area chart',
    config: { layout: { chartType: 'area', aggregation: 'count' } },
  }),
  databaseViewBlockCommand({
    id: 'database-pie-chart',
    title: 'Pie chart',
    description: 'Share-of-total chart backed by grouped database rows.',
    icon: 'view-chart',
    type: 'chart',
    keywords: ['chart', 'pie', 'graph'],
    name: 'Pie chart',
    config: { layout: { chartType: 'pie', aggregation: 'count' } },
  }),
  databaseViewBlockCommand({
    id: 'database-donut-chart',
    title: 'Donut chart',
    description: 'Donut chart backed by grouped database rows.',
    icon: 'view-chart',
    type: 'chart',
    keywords: ['chart', 'donut', 'pie', 'graph'],
    name: 'Donut chart',
    config: { layout: { chartType: 'donut', aggregation: 'count' } },
  }),
] as const;

/**
 * Slash-menu descriptors for the built-in blocks.
 *
 * Kept as plain data (no Vue / NodeView dependencies) so the default
 * slash command catalog can spread them in without instantiating
 * anything heavy. Order within each section is preserved by the
 * consumer (`createDefaultSlashCommands`).
 */
export const BUILTIN_BLOCK_SLASH = {
  toggle: {
    id: 'toggle',
    title: 'Toggle list',
    description: 'Collapsible section',
    icon: 'toggle',
    section: 'Lists',
    keywords: ['details', 'collapse', 'fold', 'accordion'],
    action: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph' }] },
          ],
        })
        .run(),
  },
  callout: {
    id: 'callout',
    title: 'Callout',
    description: 'Highlighted note with icon',
    icon: 'callout',
    section: 'Blocks',
    keywords: ['note', 'info', 'warning', 'tip', 'admonition'],
    action: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'callout',
          attrs: { icon: 'name:info' },
          content: [{ type: 'paragraph' }],
        })
        .run(),
  },
  codeBlock: {
    id: 'code-block',
    title: 'Code block',
    description: 'Syntax-highlighted code',
    icon: 'code-block',
    section: 'Blocks',
    keywords: ['code', 'pre', 'snippet', '```'],
    action: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  database: {
    id: 'database',
    title: 'Database',
    description: 'Notion-like data source (table, list, board, \u2026)',
    icon: 'database',
    section: 'Insert',
    keywords: ['table', 'list', 'board', 'kanban', 'data', 'notion'],
    action: ({ editor, range }) => {
      // Stable blockId so per-block ephemeral UI state (sticky view tab,
      // scroll position) survives editor reloads. The actual `databaseId`
      // stays null until the user picks "Create new" / "Link existing"
      // from the unbound placeholder UI.
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'database',
          attrs: createDatabaseBlockAttrs(newBlockId()),
        })
        .run();
    },
  },
  footnote: {
    id: 'footnote',
    title: 'Footnote',
    description: 'Inline reference with a popover note',
    icon: 'footnote',
    section: 'Insert',
    keywords: ['footnote', 'note', 'reference', 'sup', 'cite'],
    action: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'footnote', attrs: { content: '' } })
        .run(),
  },
} as const satisfies Record<string, BlockSlashDescriptor>;

/**
 * Build the list of built-in `BlockDefinition` entries, wiring each
 * Tiptap node to its host-provided NodeView. Returns a fresh array on
 * every call so callers can mutate / reorder safely.
 */
export function createBuiltinBlocks(views: BuiltinBlockViews): BlockDefinition[] {
  const callout: BlockDefinition = {
    type: 'callout',
    label: 'Callout',
    description: 'Highlighted note with icon',
    icon: 'callout',
    status: 'ready',
    category: 'container',
    capabilities: caps('drag', 'duplicate', 'delete', 'turn-into', 'nest-blocks', 'host-required'),
    schemaVersion: 1,
    extensions: () => [
      Callout.extend({
        addNodeView() {
          return VueNodeViewRenderer(views.calloutView);
        },
      }),
    ],
    slash: BUILTIN_BLOCK_SLASH.callout,
  };

  const details: BlockDefinition = {
    type: 'details',
    label: 'Toggle list',
    description: 'Collapsible section',
    icon: 'toggle',
    status: 'ready',
    category: 'container',
    capabilities: caps('drag', 'duplicate', 'delete', 'turn-into', 'nest-blocks', 'host-required'),
    schemaVersion: 1,
    extensions: () => [
      // Auxiliary nodes (summary + content) ship alongside the parent
      // so the registry handles the trio as a single block.
      Details.extend({
        addNodeView() {
          return VueNodeViewRenderer(views.detailsView);
        },
      }),
      DetailsSummary,
      DetailsContent,
    ],
    slash: BUILTIN_BLOCK_SLASH.toggle,
  };

  const legacyChart: BlockDefinition = {
    type: 'chart',
    label: 'Legacy chart',
    description: 'Standalone chart kept for existing documents',
    icon: 'chart',
    status: 'ready',
    category: 'embed',
    capabilities: caps('drag', 'duplicate', 'delete', 'host-required'),
    schemaVersion: 1,
    extensions: () => [
      Chart.extend({
        addNodeView() {
          return VueNodeViewRenderer(views.chartView);
        },
      }),
    ],
  };

  const database: BlockDefinition = {
    type: 'database',
    label: 'Database',
    description: 'Notion-like data source (table, list, board, \u2026)',
    icon: 'database',
    status: 'ready',
    category: 'data',
    capabilities: caps('drag', 'duplicate', 'delete', 'host-required'),
    schemaVersion: 3,
    extensions: () =>
      views.databaseView
        ? [
            Database.extend({
              addNodeView() {
                return VueNodeViewRenderer(views.databaseView!);
              },
            }),
          ]
        : // Host did not supply a renderer — register the bare node so
          // existing documents keep parsing; the node's default render
          // surfaces a small "missing host" placeholder.
          [Database],
    slash: BUILTIN_BLOCK_SLASH.database,
  };

  const footnote: BlockDefinition = {
    type: 'footnote',
    label: 'Footnote',
    description: 'Inline reference with a popover note',
    icon: 'footnote',
    status: 'ready',
    category: 'inline-atom',
    capabilities: caps('inline', 'delete', 'host-required'),
    schemaVersion: 1,
    extensions: () => [
      Footnote.extend({
        addNodeView() {
          return VueNodeViewRenderer(views.footnoteView);
        },
      }),
    ],
    slash: BUILTIN_BLOCK_SLASH.footnote,
  };

  const codeBlock: BlockDefinition = {
    type: 'codeBlock',
    label: 'Code block',
    description: 'Syntax-highlighted code',
    icon: 'code-block',
    status: 'ready',
    category: 'embed',
    capabilities: caps('drag', 'duplicate', 'delete', 'turn-into', 'host-required'),
    schemaVersion: 1,
    extensions: (): BlockExtension[] => [
      CodeBlockLowlight.extend({
        addNodeView() {
          return VueNodeViewRenderer(views.codeBlockView);
        },
      }).configure({ lowlight, defaultLanguage: 'plaintext' }),
    ],
    slash: BUILTIN_BLOCK_SLASH.codeBlock,
  };

  return [callout, details, legacyChart, database, footnote, codeBlock];
}
