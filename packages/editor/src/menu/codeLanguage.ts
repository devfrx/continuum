/**
 * "Code language" submenu — only appended when the cursor is inside a
 * code block. Lets the user retag the block to any supported language.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';
import { CODE_LANGUAGES } from '../codeLanguages';

export function buildCodeLanguageSubmenu(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  return {
    id: 'code-language',
    label: 'Code language',
    icon: 'code-block',
    children: CODE_LANGUAGES.map((l) => ({
      id: `lang-${l.value}`,
      label: l.label,
      active: ctx.codeLanguage === l.value,
      onSelect: () => editor.chain().focus().updateAttributes('codeBlock', { language: l.value }).run(),
    })),
  };
}
