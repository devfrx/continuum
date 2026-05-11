/**
 * "Color" submenu — text color and highlight (background) swatches.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';
import { TEXT_SWATCHES, HIGHLIGHT_SWATCHES } from './swatches';

export function buildColorSubmenu(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  return {
    id: 'color',
    label: 'Color',
    icon: 'palette',
    children: [
      { id: 'col-text-h', label: 'Text', header: true },
      ...TEXT_SWATCHES.map<ContextMenuItem>((s) => ({
        id: `col-${s.id}`,
        label: s.label,
        swatch: s.value === 'inherit' ? 'transparent' : s.value,
        onSelect: () => {
          if (s.value === 'inherit') {
            editor.chain().focus().extendMarkRange('textStyle').unsetColor().run();
          } else {
            editor.chain().focus().setColor(s.value).run();
          }
        },
      })),
      { id: 'col-d', divider: true },
      { id: 'col-hl-h', label: 'Background', header: true },
      ...HIGHLIGHT_SWATCHES.map<ContextMenuItem>((s) => ({
        id: `col-${s.id}`,
        label: s.label,
        swatch: s.value,
        onSelect: () => {
          if (s.value === 'transparent') {
            editor.chain().focus().extendMarkRange('highlight').unsetHighlight().run();
          } else {
            editor.chain().focus().setHighlight({ color: s.value }).run();
          }
        },
      })),
    ],
  };
}
