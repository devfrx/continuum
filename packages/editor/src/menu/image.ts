/**
 * "Image" actions — only appended when an image node is selected.
 * Provides alignment, replace, and delete.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';

export function buildImageActions(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  const currentAlign = (editor.getAttributes('image').align as string | undefined) ?? 'left';
  const setAlign = (a: 'left' | 'center' | 'right'): void => {
    editor.chain().focus().updateAttributes('image', { align: a }).run();
  };
  return {
    id: 'image-actions',
    label: 'Image',
    icon: 'image',
    children: [
      {
        id: 'img-align',
        label: 'Align',
        icon: 'align-left',
        children: [
          {
            id: 'img-a-left', label: 'Left', icon: 'align-left',
            active: currentAlign === 'left', onSelect: () => setAlign('left'),
          },
          {
            id: 'img-a-center', label: 'Center', icon: 'align-center',
            active: currentAlign === 'center', onSelect: () => setAlign('center'),
          },
          {
            id: 'img-a-right', label: 'Right', icon: 'align-right',
            active: currentAlign === 'right', onSelect: () => setAlign('right'),
          },
        ],
      },
      {
        id: 'img-replace',
        label: 'Replace\u2026',
        icon: 'image',
        onSelect: async () => {
          const url = await ctx.requestPrompt({
            title: 'Replace image',
            label: 'Image URL',
            placeholder: 'https://… or data:image/…',
            confirmLabel: 'Replace',
          });
          if (url) editor.chain().focus().updateAttributes('image', { src: url }).run();
        },
      },
      { id: 'img-d2', divider: true },
      {
        id: 'img-del',
        label: 'Delete image',
        danger: true,
        onSelect: () => editor.chain().focus().deleteSelection().run(),
      },
    ],
  };
}
