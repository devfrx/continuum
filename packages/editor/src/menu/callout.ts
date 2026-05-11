/**
 * "Callout" actions — only appended when the cursor is inside a
 * callout. Provides quick icon picks, custom URL, and reset.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';
import { CALLOUT_QUICK_ICONS } from './swatches';

export function buildCalloutActions(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  const currentIcon = (editor.getAttributes('callout').icon as string | undefined) ?? 'name:idea';
  return {
    id: 'callout-actions',
    label: 'Callout',
    icon: 'callout',
    children: [
      { id: 'callout-icon-h', label: 'Quick icons', header: true },
      ...CALLOUT_QUICK_ICONS.map<ContextMenuItem>((id) => ({
        id: `callout-icon-${id}`,
        label: id,
        icon: id,
        active: currentIcon === `name:${id}`,
        onSelect: () =>
          editor.chain().focus().updateAttributes('callout', { icon: `name:${id}` }).run(),
      })),
      { id: 'callout-icon-d', divider: true },
      {
        id: 'callout-icon-url',
        label: 'Custom URL\u2026',
        onSelect: async () => {
          const value = await ctx.requestPrompt({
            title: 'Set callout icon from URL',
            label: 'Image URL',
            placeholder: 'https://img.icons8.com/\u2026',
            initialValue: currentIcon.startsWith('url:') ? currentIcon.slice(4) : '',
            confirmLabel: 'Set',
          });
          if (!value) return;
          const trimmed = value.trim();
          if (!/^(https?:|data:image\/)/i.test(trimmed)) return;
          editor
            .chain()
            .focus()
            .updateAttributes('callout', { icon: `url:${trimmed}` })
            .run();
        },
      },
      {
        id: 'callout-icon-reset',
        label: 'Reset to default',
        onSelect: () =>
          editor.chain().focus().updateAttributes('callout', { icon: 'name:info' }).run(),
      },
    ],
  };
}
