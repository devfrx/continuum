/**
 * Builds a Notion-equivalent right-click menu for the ContinuumEditor from the
 * current Tiptap editor instance.
 *
 * Items are produced eagerly with snapshot `active` flags reflecting the
 * editor state at the moment the menu is opened. Each leaf calls back into
 * the editor's command chain when selected. The menu structure mirrors
 * Notion's "Turn into / Format / Insert / Color" hierarchy.
 *
 * Per-submenu factories live in `./menu/*` so this orchestrator stays
 * focused on composition. The public surface (`buildEditorMenu`,
 * `MenuContext`, `PromptRequest`) is preserved for external callers.
 */
import type { Editor } from '@tiptap/core';
import type { ContextMenuItem } from '@continuum/shared';
import { buildTurnIntoSubmenu } from './menu/turnInto';
import { buildFormatSubmenu } from './menu/format';
import { buildColorSubmenu } from './menu/color';
import { buildInsertSubmenu } from './menu/insert';
import { buildImageActions } from './menu/image';
import { buildCodeLanguageSubmenu } from './menu/codeLanguage';
import { buildCalloutActions } from './menu/callout';
import { buildTableActions } from './menu/table';
import { buildEditActions } from './menu/edit';

/**
 * Single-line text input request. The host renders its own prompt UI
 * (e.g. UiPromptModal) and invokes `resolve(value)` with the entered
 * string, or `resolve(null)` to signal cancellation.
 */
export interface PromptRequest {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

export interface MenuContext {
  editor: Editor;
  /** True when the cursor is inside a code block. */
  inCodeBlock: boolean;
  /** Current code block language (when in a code block). */
  codeLanguage: string | null;
  /** True when there's a non-empty selection. */
  hasSelection: boolean;
  /**
   * Async prompt for a single-line text value. Resolves with the trimmed
   * value, or `null` if the user cancels.
   */
  requestPrompt: (opts: Omit<PromptRequest, 'resolve'>) => Promise<string | null>;
}

export function buildEditorMenu(ctx: MenuContext): ContextMenuItem[] {
  const { editor } = ctx;
  const items: ContextMenuItem[] = [
    buildTurnIntoSubmenu(ctx),
    buildFormatSubmenu(ctx),
    buildColorSubmenu(ctx),
    buildInsertSubmenu(ctx),
  ];

  // Image-specific actions when an image node is selected.
  if (editor.isActive('image')) {
    items.push({ id: 'img-d', divider: true });
    items.push(buildImageActions(ctx));
  }

  if (ctx.inCodeBlock) {
    items.push({ id: 'cb-d', divider: true });
    items.push(buildCodeLanguageSubmenu(ctx));
  }

  // Callout-specific actions: icon swap.
  if (editor.isActive('callout') && !editor.isActive('codeBlock')) {
    items.push({ id: 'callout-d', divider: true });
    items.push(buildCalloutActions(ctx));
  }

  // Table-specific actions.
  if (editor.isActive('table')) {
    items.push({ id: 't-d', divider: true });
    items.push(buildTableActions(ctx));
  }

  items.push({ id: 'edit-d', divider: true });
  items.push(...buildEditActions(ctx));

  return items;
}
