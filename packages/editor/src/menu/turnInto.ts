/**
 * "Turn into" submenu — converts the current block into a different
 * structural type (heading, list, callout, toggle, etc.).
 */
import type { Editor } from '@tiptap/core';
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';

/**
 * Convert the current block into a Callout, preserving its content. If
 * the cursor is already inside a callout we no-op (the menu item is also
 * marked active in that case so the click is just a confirmation).
 */
function turnIntoCallout(editor: Editor): void {
  if (editor.isActive('callout')) return;
  const chain = editor.chain().focus();
  if (!chain.wrapIn('callout', { icon: 'name:info' }).run()) {
    // Fallback for selections that wrapIn rejects (e.g. inside a list):
    // replace the selected range with a callout containing the same content.
    const { from, to } = editor.state.selection;
    const slice = editor.state.doc.slice(from, to);
    const json = slice.content.toJSON() as Array<Record<string, unknown>> | undefined;
    editor.chain().focus().insertContentAt({ from, to }, {
      type: 'callout',
      attrs: { icon: 'name:idea' },
      content: json && json.length ? json : [{ type: 'paragraph' }],
    }).run();
  }
}

/**
 * Convert the current block into a Toggle, preserving its content. The
 * first paragraph's text becomes the toggle summary and the rest moves
 * into the body so nothing is silently dropped.
 */
function turnIntoToggle(editor: Editor): void {
  if (editor.isActive('details')) return;
  const { state } = editor;
  const $from = state.selection.$from;
  const blockRange = $from.blockRange();
  const from = blockRange ? blockRange.start : state.selection.from;
  const to = blockRange ? blockRange.end : state.selection.to;
  const slice = state.doc.slice(from, to);
  const summaryText = (slice.content.firstChild?.textContent ?? '').trim() || 'Toggle';
  const rawContent = slice.content.toJSON() as Array<Record<string, unknown>> | undefined;
  const bodyContent = (rawContent && rawContent.length > 1)
    ? rawContent.slice(1)
    : [{ type: 'paragraph' }];
  editor.chain().focus().insertContentAt({ from, to }, {
    type: 'details',
    attrs: { open: true },
    content: [
      { type: 'detailsSummary', content: [{ type: 'text', text: summaryText }] },
      { type: 'detailsContent', content: bodyContent },
    ],
  }).run();
}

export function buildTurnIntoSubmenu(ctx: MenuContext): ContextMenuItem {
  const { editor } = ctx;
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);
  return {
    id: 'turn-into',
    label: 'Turn into',
    icon: 'edit',
    children: [
      {
        id: 'ti-paragraph',
        label: 'Text',
        icon: 'notes',
        active: isActive('paragraph') && !isActive('heading'),
        onSelect: () => editor.chain().focus().setParagraph().run(),
      },
      {
        id: 'ti-h1',
        label: 'Heading 1',
        icon: 'heading-1',
        shortcut: 'Ctrl+Alt+1',
        active: isActive('heading', { level: 1 }),
        onSelect: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        id: 'ti-h2',
        label: 'Heading 2',
        icon: 'heading-2',
        shortcut: 'Ctrl+Alt+2',
        active: isActive('heading', { level: 2 }),
        onSelect: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        id: 'ti-h3',
        label: 'Heading 3',
        icon: 'heading-3',
        shortcut: 'Ctrl+Alt+3',
        active: isActive('heading', { level: 3 }),
        onSelect: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        id: 'ti-h4',
        label: 'Heading 4',
        icon: 'heading-4',
        active: isActive('heading', { level: 4 }),
        onSelect: () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
      },
      { id: 'ti-d1', divider: true },
      {
        id: 'ti-bullet',
        label: 'Bulleted list',
        icon: 'list-bullet',
        active: isActive('bulletList'),
        onSelect: () => editor.chain().focus().toggleBulletList().run(),
      },
      {
        id: 'ti-ordered',
        label: 'Numbered list',
        icon: 'list-ordered',
        active: isActive('orderedList'),
        onSelect: () => editor.chain().focus().toggleOrderedList().run(),
      },
      {
        id: 'ti-task',
        label: 'To-do list',
        icon: 'task',
        active: isActive('taskList'),
        onSelect: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: 'ti-toggle',
        label: 'Toggle',
        icon: 'toggle',
        active: isActive('details'),
        onSelect: () => turnIntoToggle(editor),
      },
      {
        id: 'ti-callout',
        label: 'Callout',
        icon: 'callout',
        active: isActive('callout'),
        onSelect: () => turnIntoCallout(editor),
      },
      {
        id: 'ti-quote',
        label: 'Quote',
        icon: 'quote',
        active: isActive('blockquote'),
        onSelect: () => editor.chain().focus().toggleBlockquote().run(),
      },
      {
        id: 'ti-code',
        label: 'Code block',
        icon: 'code-block',
        active: isActive('codeBlock'),
        onSelect: () => editor.chain().focus().toggleCodeBlock().run(),
      },
    ],
  };
}
