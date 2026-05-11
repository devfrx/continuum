/**
 * "Table" actions — only appended when the cursor is inside a table.
 * Row/column add/delete, header toggles, merge/split, and delete table.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';

export function buildTableActions(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  return {
    id: 'table-actions',
    label: 'Table',
    icon: 'table',
    children: [
      { id: 'tr-add-above', label: 'Add row above', onSelect: () => editor.chain().focus().addRowBefore().run() },
      { id: 'tr-add-below', label: 'Add row below', onSelect: () => editor.chain().focus().addRowAfter().run() },
      { id: 'tr-del', label: 'Delete row', danger: true, onSelect: () => editor.chain().focus().deleteRow().run() },
      { id: 'tr-d1', divider: true },
      { id: 'tc-add-left', label: 'Add column left', onSelect: () => editor.chain().focus().addColumnBefore().run() },
      { id: 'tc-add-right', label: 'Add column right', onSelect: () => editor.chain().focus().addColumnAfter().run() },
      { id: 'tc-del', label: 'Delete column', danger: true, onSelect: () => editor.chain().focus().deleteColumn().run() },
      { id: 'tt-d1', divider: true },
      { id: 'tt-hrow', label: 'Toggle header row', onSelect: () => editor.chain().focus().toggleHeaderRow().run() },
      { id: 'tt-hcol', label: 'Toggle header column', onSelect: () => editor.chain().focus().toggleHeaderColumn().run() },
      { id: 'tt-merge', label: 'Merge cells', onSelect: () => editor.chain().focus().mergeCells().run() },
      { id: 'tt-split', label: 'Split cell', onSelect: () => editor.chain().focus().splitCell().run() },
      { id: 'tt-d2', divider: true },
      { id: 'tt-del', label: 'Delete table', danger: true, onSelect: () => editor.chain().focus().deleteTable().run() },
    ],
  };
}
