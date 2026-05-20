/**
 * "Insert" submenu — block-level inserts (divider, quote, code block,
 * task list, toggle, callout, table, database views, image, wikilink).
 */
import type { ContextMenuItem } from '@continuum/shared';
import {
  createDatabaseBlockAttrs,
  type DatabaseBlockInitialView,
} from '@continuum/shared';
import type { MenuContext } from '../editorMenu';

function newBlockId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function insertDatabaseView(ctx: MenuContext, initialView: DatabaseBlockInitialView | null = null): void {
  ctx.editor
    .chain()
    .focus()
    .insertContent({ type: 'database', attrs: createDatabaseBlockAttrs(newBlockId(), initialView) })
    .run();
}

export function buildInsertSubmenu(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  return {
    id: 'insert',
    label: 'Insert',
    icon: 'plus',
    children: [
      {
        id: 'in-divider',
        label: 'Divider',
        icon: 'divider',
        onSelect: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: 'in-quote',
        label: 'Quote',
        icon: 'quote',
        onSelect: () => editor.chain().focus().setBlockquote().run(),
      },
      {
        id: 'in-code',
        label: 'Code block',
        icon: 'code-block',
        onSelect: () => editor.chain().focus().setCodeBlock().run(),
      },
      {
        id: 'in-task',
        label: 'To-do list',
        icon: 'task',
        onSelect: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: 'in-toggle',
        label: 'Toggle',
        icon: 'toggle',
        onSelect: () => editor.chain().focus().insertContent({
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph' }] },
          ],
        }).run(),
      },
      {
        id: 'in-callout',
        label: 'Callout',
        icon: 'callout',
        onSelect: () => editor.chain().focus().insertContent({
          type: 'callout',
          attrs: { icon: 'name:info' },
          content: [{ type: 'paragraph' }],
        }).run(),
      },
      {
        id: 'in-table',
        label: 'Table',
        icon: 'table',
        onSelect: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        id: 'in-chart-view',
        label: 'Chart view',
        icon: 'view-chart',
        onSelect: () => insertDatabaseView(ctx, {
          type: 'chart',
          name: 'Bar chart',
          config: { layout: { chartType: 'bar', aggregation: 'count' } },
        }),
      },
      {
        id: 'in-database',
        label: 'Database',
        icon: 'database',
        onSelect: () => insertDatabaseView(ctx),
      },
      {
        id: 'in-image',
        label: 'Image\u2026',
        icon: 'image',
        onSelect: async () => {
          const url = await ctx.requestPrompt({
            title: 'Insert image',
            label: 'Image URL',
            placeholder: 'https://… or data:image/…',
            confirmLabel: 'Insert',
          });
          if (url) editor.chain().focus().setImage({ src: url }).run();
        },
      },
      {
        id: 'in-wikilink',
        label: 'Wikilink [[ ]]',
        icon: 'wikilink',
        shortcut: 'Ctrl+K',
        onSelect: () => {
          const { from, to, empty } = editor.state.selection;
          if (empty) {
            editor.chain().focus().insertContent('[[]]').setTextSelection(from + 2).run();
          } else {
            const text = editor.state.doc.textBetween(from, to, ' ');
            editor.chain().focus().insertContentAt({ from, to }, `[[${text}]]`).run();
          }
        },
      },
      {
        id: 'in-footnote',
        label: 'Footnote',
        icon: 'footnote',
        onSelect: () =>
          editor
            .chain()
            .focus()
            .insertContent({ type: 'footnote', attrs: { content: '' } })
            .run(),
      },
    ],
  };
}
