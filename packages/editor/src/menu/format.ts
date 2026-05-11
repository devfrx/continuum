/**
 * "Format" submenu — inline marks, alignment, and link editing.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';

export function buildFormatSubmenu(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);
  const isAlign = (v: 'left' | 'center' | 'right' | 'justify') =>
    (editor.isActive as (a: Record<string, unknown>) => boolean)({ textAlign: v });

  return {
    id: 'format',
    label: 'Format',
    icon: 'bold',
    children: [
      {
        id: 'f-bold',
        label: 'Bold',
        icon: 'bold',
        shortcut: 'Ctrl+B',
        active: isActive('bold'),
        onSelect: () => editor.chain().focus().toggleBold().run(),
      },
      {
        id: 'f-italic',
        label: 'Italic',
        icon: 'italic',
        shortcut: 'Ctrl+I',
        active: isActive('italic'),
        onSelect: () => editor.chain().focus().toggleItalic().run(),
      },
      {
        id: 'f-under',
        label: 'Underline',
        icon: 'underline',
        shortcut: 'Ctrl+U',
        active: isActive('underline'),
        onSelect: () => editor.chain().focus().toggleUnderline().run(),
      },
      {
        id: 'f-strike',
        label: 'Strikethrough',
        icon: 'strike',
        shortcut: 'Ctrl+Shift+X',
        active: isActive('strike'),
        onSelect: () => editor.chain().focus().toggleStrike().run(),
      },
      {
        id: 'f-code',
        label: 'Inline code',
        icon: 'code',
        shortcut: 'Ctrl+E',
        active: isActive('code'),
        onSelect: () => editor.chain().focus().toggleCode().run(),
      },
      { id: 'f-d1', divider: true },
      {
        id: 'f-sub',
        label: 'Subscript',
        icon: 'subscript',
        active: isActive('subscript'),
        onSelect: () => editor.chain().focus().toggleSubscript().run(),
      },
      {
        id: 'f-sup',
        label: 'Superscript',
        icon: 'superscript',
        active: isActive('superscript'),
        onSelect: () => editor.chain().focus().toggleSuperscript().run(),
      },
      { id: 'f-d2', divider: true },
      {
        id: 'f-align',
        label: 'Align',
        icon: 'align-left',
        children: [
          {
            id: 'a-left', label: 'Left', icon: 'align-left', active: isAlign('left'),
            onSelect: () => editor.chain().focus().setTextAlign('left').run(),
          },
          {
            id: 'a-center', label: 'Center', icon: 'align-center', active: isAlign('center'),
            onSelect: () => editor.chain().focus().setTextAlign('center').run(),
          },
          {
            id: 'a-right', label: 'Right', icon: 'align-right', active: isAlign('right'),
            onSelect: () => editor.chain().focus().setTextAlign('right').run(),
          },
          {
            id: 'a-justify', label: 'Justify', icon: 'align-justify', active: isAlign('justify'),
            onSelect: () => editor.chain().focus().setTextAlign('justify').run(),
          },
        ],
      },
      {
        id: 'f-link',
        label: isActive('link') ? 'Edit link…' : 'Add link…',
        icon: 'link',
        shortcut: 'Ctrl+K',
        onSelect: async () => {
          const prev = (editor.getAttributes('link').href as string | undefined) ?? '';
          const url = await ctx.requestPrompt({
            title: prev ? 'Edit link' : 'Add link',
            label: 'URL',
            placeholder: 'https://…',
            initialValue: prev,
            confirmLabel: 'Save',
          });
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        },
      },
      ...(isActive('link') ? [{
        id: 'f-unlink',
        label: 'Remove link',
        icon: 'unlink' as const,
        onSelect: () => editor.chain().focus().unsetLink().run(),
      }] : []),
      { id: 'f-d3', divider: true },
      {
        id: 'f-clear',
        label: 'Clear formatting',
        onSelect: () => editor.chain().focus().clearNodes().unsetAllMarks().run(),
      },
    ],
  };
}
