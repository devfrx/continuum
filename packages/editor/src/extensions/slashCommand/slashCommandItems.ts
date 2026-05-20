/**
 * Default catalog of slash-menu commands.
 *
 * Each item is a self-contained descriptor: a search-friendly identity
 * (`title`, `description`, `keywords`), a section to group it under in
 * the popup, an icon name resolved through the host's icon catalog, and
 * an `action` that receives the live editor + the range covering the
 * trigger text (`/query`) so it can replace it atomically.
 *
 * Native StarterKit-based items (paragraph, headings, lists, quote,
 * divider, table, wikilink) are declared inline below. Custom-block
 * items (toggle, callout, code-block, database, footnote) are sourced
 * from the block registry (`BUILTIN_BLOCK_SLASH`), while database view
 * layouts are exposed as first-class insert commands backed by the same
 * `database` node.
 *
 * The list is intentionally a plain array so hosts can extend, filter,
 * or reorder it before passing back into `SlashCommand.configure({...})`.
 * Keep this file free of Vue / DOM imports — it is pure data + commands.
 */
import { BUILTIN_BLOCK_SLASH, DATABASE_VIEW_BLOCK_SLASH } from '../../blocks/builtinBlocks';
import {
  SLASH_COMMAND_SECTIONS,
  type BlockSlashDescriptor,
  type SlashCommandSection,
} from '../../blocks/types';

export { SLASH_COMMAND_SECTIONS };
export type { SlashCommandSection };

/**
 * Structurally identical to `BlockSlashDescriptor`; aliased here so the
 * slash extension keeps its own public type name while the registry
 * remains the single source of truth.
 */
export type SlashCommandItem = BlockSlashDescriptor;

/**
 * Builder for the default Continuum command set. Returning a fresh array
 * each call lets hosts mutate the list without poisoning the singleton.
 */
export function createDefaultSlashCommands(): SlashCommandItem[] {
  const block = BUILTIN_BLOCK_SLASH;
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
    // Toggle/Details lives in the block registry.
    block.toggle,

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
    block.callout,
    block.codeBlock,
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
    block.database,
    ...DATABASE_VIEW_BLOCK_SLASH,
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
    block.footnote,
  ];
}
