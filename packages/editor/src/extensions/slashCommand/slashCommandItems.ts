/**
 * Default catalog of slash-menu commands.
 *
 * Each item is a self-contained descriptor: a search-friendly identity
 * (`title`, `description`, `keywords`), a section to group it under in
 * the popup, an icon name resolved through the host's icon catalog, and
 * an `action` that receives the live editor + the range covering the
 * trigger text (`/query`) so it can replace it atomically.
 *
 * The list is intentionally a plain array so hosts can extend, filter,
 * or reorder it before passing back into `SlashCommand.configure({...})`.
 * Keep this file free of Vue / DOM imports — it is pure data + commands.
 */
import type { Editor, Range } from '@tiptap/core';

/** Logical sections rendered as headers in the popup, in display order. */
export const SLASH_COMMAND_SECTIONS = ['Basic', 'Lists', 'Blocks', 'Insert'] as const;

export type SlashCommandSection = (typeof SLASH_COMMAND_SECTIONS)[number];

export interface SlashCommandItem {
  /** Stable identifier (used as Vue `:key` and analytics handle). */
  id: string;
  /** Primary label shown in the menu (e.g. "Heading 1"). */
  title: string;
  /** Single-line caption shown beneath the title. */
  description: string;
  /** Icon name resolved by the host icon catalog (`<Icon :name="…">`). */
  icon: string;
  /** Section header under which the item is grouped. */
  section: SlashCommandSection;
  /**
   * Extra search terms that should match the typed query in addition to
   * the title (e.g. `'h1', 'title'` for Heading 1, `'image', 'picture'`).
   */
  keywords?: string[];
  /**
   * Run the command. Implementations are responsible for clearing the
   * trigger range (`editor.chain().focus().deleteRange(range)…`) so the
   * `/query` text is replaced rather than left in the document.
   */
  action: (args: { editor: Editor; range: Range }) => void;
}

/**
 * Builder for the default Continuum command set. Returning a fresh array
 * each call lets hosts mutate the list without poisoning the singleton.
 */
export function createDefaultSlashCommands(): SlashCommandItem[] {
  return [
    // ── Basic ────────────────────────────────────────────────────────
    {
      id: 'paragraph',
      title: 'Text',
      description: 'Plain paragraph',
      icon: 'notes',
      section: 'Basic',
      keywords: ['paragraph', 'p', 'plain', 'body'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      id: 'heading-1',
      title: 'Heading 1',
      description: 'Top-level title',
      icon: 'heading-1',
      section: 'Basic',
      keywords: ['h1', 'title', 'big'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
    },
    {
      id: 'heading-2',
      title: 'Heading 2',
      description: 'Section heading',
      icon: 'heading-2',
      section: 'Basic',
      keywords: ['h2', 'section'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
    },
    {
      id: 'heading-3',
      title: 'Heading 3',
      description: 'Subsection heading',
      icon: 'heading-3',
      section: 'Basic',
      keywords: ['h3', 'subsection'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
    },
    {
      id: 'heading-4',
      title: 'Heading 4',
      description: 'Smaller subheading',
      icon: 'heading-4',
      section: 'Basic',
      keywords: ['h4'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 4 }).run(),
    },

    // ── Lists ────────────────────────────────────────────────────────
    {
      id: 'bullet-list',
      title: 'Bulleted list',
      description: 'Simple unordered list',
      icon: 'list-bullet',
      section: 'Lists',
      keywords: ['ul', 'unordered', 'bullets'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: 'ordered-list',
      title: 'Numbered list',
      description: 'List with sequential numbers',
      icon: 'list-ordered',
      section: 'Lists',
      keywords: ['ol', 'numbered', '1.', 'numbers'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: 'task-list',
      title: 'To-do list',
      description: 'Track tasks with checkboxes',
      icon: 'task',
      section: 'Lists',
      keywords: ['todo', 'task', 'checkbox', 'check'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
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

    // ── Blocks ───────────────────────────────────────────────────────
    {
      id: 'quote',
      title: 'Quote',
      description: 'Block quotation',
      icon: 'quote',
      section: 'Blocks',
      keywords: ['blockquote', 'cite'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setBlockquote().run(),
    },
    {
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
    {
      id: 'code-block',
      title: 'Code block',
      description: 'Syntax-highlighted code',
      icon: 'code-block',
      section: 'Blocks',
      keywords: ['code', 'pre', 'snippet', '```'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setCodeBlock().run(),
    },
    {
      id: 'divider',
      title: 'Divider',
      description: 'Horizontal separator',
      icon: 'divider',
      section: 'Blocks',
      keywords: ['hr', 'rule', 'line', 'separator', '---'],
      action: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },

    // ── Insert ───────────────────────────────────────────────────────
    {
      id: 'table',
      title: 'Table',
      description: '3×3 table with header row',
      icon: 'table',
      section: 'Insert',
      keywords: ['grid', 'rows', 'columns', 'spreadsheet'],
      action: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      id: 'chart',
      title: 'Chart',
      description: 'Bar / line / pie data viz',
      icon: 'chart',
      section: 'Insert',
      keywords: ['graph', 'plot', 'bar', 'line', 'pie', 'data'],
      action: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: 'chart',
            attrs: {
              kind: 'bar',
              data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr'],
                datasets: [{ label: 'Series A', data: [12, 19, 8, 15] }],
              },
              options: { title: 'Untitled chart', showLegend: true, showGrid: true },
            },
          })
          .run(),
    },
    {
      id: 'wikilink',
      title: 'Wikilink',
      description: 'Reference another note [[ ]]',
      icon: 'wikilink',
      section: 'Insert',
      keywords: ['link', 'note', 'reference', '[['],
      action: ({ editor, range }) => {
        // Mirror Ctrl+K / Insert→Wikilink: replace the trigger with `[[]]`
        // and place the caret between the brackets ready for typing.
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent('[[]]')
          .setTextSelection(range.from + 2)
          .run();
      },
    },
    {
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
  ];
}
