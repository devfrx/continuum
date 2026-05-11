/**
 * "Edit" actions — always appended at the bottom of the menu.
 * Cut/copy/paste/duplicate/select-all/undo/redo.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';

export function buildEditActions(ctx: MenuContext): ContextMenuItem[] {
  const { editor } = ctx;
  return [
    {
      id: 'edit-cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', disabled: !ctx.hasSelection,
      onSelect: () => document.execCommand('cut'),
    },
    {
      id: 'edit-copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', disabled: !ctx.hasSelection,
      onSelect: () => document.execCommand('copy'),
    },
    {
      id: 'edit-paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V',
      onSelect: () => document.execCommand('paste'),
    },
    {
      id: 'edit-duplicate', label: 'Duplicate selection', icon: 'copy', shortcut: 'Ctrl+D',
      disabled: !ctx.hasSelection,
      onSelect: () => {
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const slice = editor.state.doc.slice(from, to).content;
        editor.chain().focus().insertContentAt(to, slice.toJSON()).run();
      },
    },
    { id: 'edit-d2', divider: true },
    {
      id: 'edit-select-all', label: 'Select all', shortcut: 'Ctrl+A',
      onSelect: () => editor.chain().focus().selectAll().run(),
    },
    {
      id: 'edit-undo', label: 'Undo', icon: 'arrow-left', shortcut: 'Ctrl+Z',
      disabled: !editor.can().undo(),
      onSelect: () => editor.chain().focus().undo().run(),
    },
    {
      id: 'edit-redo', label: 'Redo', icon: 'arrow-right', shortcut: 'Ctrl+Shift+Z',
      disabled: !editor.can().redo(),
      onSelect: () => editor.chain().focus().redo().run(),
    },
  ];
}
