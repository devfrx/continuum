/**
 * Builds a Notion-equivalent right-click menu for the LoreEditor from the
 * current Tiptap editor instance.
 *
 * Items are produced eagerly with snapshot `active` flags reflecting the
 * editor state at the moment the menu is opened. Each leaf calls back into
 * the editor's command chain when selected. The menu structure mirrors
 * Notion's "Turn into / Format / Insert / Color" hierarchy.
 */
import type { Editor } from '@tiptap/core';
import type { ContextMenuItem } from '@continuum/shared';
import { CODE_LANGUAGES } from './extensions';

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

const TEXT_SWATCHES: { id: string; label: string; value: string }[] = [
  { id: 'default', label: 'Default', value: 'inherit' },
  { id: 'gray', label: 'Gray', value: '#9CA3AF' },
  { id: 'brown', label: 'Brown', value: '#B45309' },
  { id: 'orange', label: 'Orange', value: '#F97316' },
  { id: 'yellow', label: 'Yellow', value: '#EAB308' },
  { id: 'green', label: 'Green', value: '#10B981' },
  { id: 'blue', label: 'Blue', value: '#3B82F6' },
  { id: 'purple', label: 'Purple', value: '#8B5CF6' },
  { id: 'pink', label: 'Pink', value: '#EC4899' },
  { id: 'red', label: 'Red', value: '#EF4444' },
];

const HIGHLIGHT_SWATCHES: { id: string; label: string; value: string }[] = [
  { id: 'h-default', label: 'None', value: 'transparent' },
  { id: 'h-gray', label: 'Gray', value: '#E5E7EB' },
  { id: 'h-yellow', label: 'Yellow', value: '#FEF3C7' },
  { id: 'h-orange', label: 'Orange', value: '#FFEDD5' },
  { id: 'h-green', label: 'Green', value: '#D1FAE5' },
  { id: 'h-blue', label: 'Blue', value: '#DBEAFE' },
  { id: 'h-purple', label: 'Purple', value: '#EDE9FE' },
  { id: 'h-pink', label: 'Pink', value: '#FCE7F3' },
  { id: 'h-red', label: 'Red', value: '#FEE2E2' },
];

export function buildEditorMenu(ctx: MenuContext): ContextMenuItem[] {
  const { editor } = ctx;
  const isActive = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs);
  const isAlign = (v: 'left' | 'center' | 'right' | 'justify') =>
    (editor.isActive as (a: Record<string, unknown>) => boolean)({ textAlign: v });

  const turnInto: ContextMenuItem = {
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
      },      {
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
        onSelect: () => editor.chain().focus().insertContent({
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph' }] },
          ],
        }).run(),
      },
      {
        id: 'ti-callout',
        label: 'Callout',
        icon: 'callout',
        active: isActive('callout'),
        onSelect: () => editor.chain().focus().insertContent({
          type: 'callout',
          attrs: { emoji: '\u{1F4A1}' },
          content: [{ type: 'paragraph' }],
        }).run(),
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

  const format: ContextMenuItem = {
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

  const color: ContextMenuItem = {
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
          if (s.value === 'inherit') editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(s.value).run();
        },
      })),
      { id: 'col-d', divider: true },
      { id: 'col-hl-h', label: 'Background', header: true },
      ...HIGHLIGHT_SWATCHES.map<ContextMenuItem>((s) => ({
        id: `col-${s.id}`,
        label: s.label,
        swatch: s.value,
        onSelect: () => {
          if (s.value === 'transparent') editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().toggleHighlight({ color: s.value }).run();
        },
      })),
    ],
  };

  const insert: ContextMenuItem = {
    id: 'insert',
    label: 'Insert',
    icon: 'plus',
    children: [
      {
        id: 'in-divider',
        label: 'Divider',
        icon: 'divider',
        onSelect: () => editor.chain().focus().setHorizontalRule().run(),
      },
      {
        id: 'in-quote',
        label: 'Quote',
        icon: 'quote',
        onSelect: () => editor.chain().focus().setBlockquote().run(),
      },
      {
        id: 'in-code',
        label: 'Code block',
        icon: 'code-block',
        onSelect: () => editor.chain().focus().setCodeBlock().run(),
      },
      {
        id: 'in-task',
        label: 'To-do list',
        icon: 'task',
        onSelect: () => editor.chain().focus().toggleTaskList().run(),
      },
      {
        id: 'in-toggle',
        label: 'Toggle',
        icon: 'toggle',
        onSelect: () => editor.chain().focus().insertContent({
          type: 'details',
          attrs: { open: true },
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph' }] },
          ],
        }).run(),
      },
      {
        id: 'in-callout',
        label: 'Callout',
        icon: 'callout',
        onSelect: () => editor.chain().focus().insertContent({
          type: 'callout',
          attrs: { emoji: '\u{1F4A1}' },
          content: [{ type: 'paragraph' }],
        }).run(),
      },
      {
        id: 'in-table',
        label: 'Table',
        icon: 'table',
        onSelect: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      {
        id: 'in-image',
        label: 'Image\u2026',
        icon: 'image',
        onSelect: async () => {
          const url = await ctx.requestPrompt({
            title: 'Insert image',
            label: 'Image URL',
            placeholder: 'https://… or data:image/…',
            confirmLabel: 'Insert',
          });
          if (url) editor.chain().focus().setImage({ src: url }).run();
        },
      },
      {
        id: 'in-wikilink',
        label: 'Wikilink [[ ]]',
        icon: 'wikilink',
        shortcut: 'Ctrl+K',
        onSelect: () => {
          const { from, to, empty } = editor.state.selection;
          if (empty) {
            editor.chain().focus().insertContent('[[]]').setTextSelection(from + 2).run();
          } else {
            const text = editor.state.doc.textBetween(from, to, ' ');
            editor.chain().focus().insertContentAt({ from, to }, `[[${text}]]`).run();
          }
        },
      },
    ],
  };

  const items: ContextMenuItem[] = [turnInto, format, color, insert];

  // Image-specific actions when an image node is selected.
  if (editor.isActive('image')) {
    const currentAlign = (editor.getAttributes('image').align as string | undefined) ?? 'left';
    const setAlign = (a: 'left' | 'center' | 'right'): void => {
      editor.chain().focus().updateAttributes('image', { align: a }).run();
    };
    items.push({ id: 'img-d', divider: true });
    items.push({
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
    });
  }

  if (ctx.inCodeBlock) {
    items.push({ id: 'cb-d', divider: true });
    items.push({
      id: 'code-language',
      label: 'Code language',
      icon: 'code-block',
      children: CODE_LANGUAGES.map((l) => ({
        id: `lang-${l.value}`,
        label: l.label,
        active: ctx.codeLanguage === l.value,
        onSelect: () => editor.chain().focus().updateAttributes('codeBlock', { language: l.value }).run(),
      })),
    });
  }

  // Table-specific actions
  if (editor.isActive('table')) {
    items.push({ id: 't-d', divider: true });
    items.push({
      id: 'table-actions',
      label: 'Table',
      icon: 'table',
      children: [
        { id: 'tr-add-above', label: 'Add row above', onSelect: () => editor.chain().focus().addRowBefore().run() },
        { id: 'tr-add-below', label: 'Add row below', onSelect: () => editor.chain().focus().addRowAfter().run() },
        { id: 'tr-del', label: 'Delete row', onSelect: () => editor.chain().focus().deleteRow().run() },
        { id: 'tr-d1', divider: true },
        { id: 'tc-add-left', label: 'Add column left', onSelect: () => editor.chain().focus().addColumnBefore().run() },
        { id: 'tc-add-right', label: 'Add column right', onSelect: () => editor.chain().focus().addColumnAfter().run() },
        { id: 'tc-del', label: 'Delete column', onSelect: () => editor.chain().focus().deleteColumn().run() },
        { id: 'tt-d1', divider: true },
        { id: 'tt-del', label: 'Delete table', danger: true, onSelect: () => editor.chain().focus().deleteTable().run() },
      ],
    });
  }

  items.push({ id: 'edit-d', divider: true });
  items.push({
    id: 'edit-cut', label: 'Cut', icon: 'cut', shortcut: 'Ctrl+X', disabled: !ctx.hasSelection,
    onSelect: () => document.execCommand('cut'),
  });
  items.push({
    id: 'edit-copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', disabled: !ctx.hasSelection,
    onSelect: () => document.execCommand('copy'),
  });
  items.push({
    id: 'edit-paste', label: 'Paste', icon: 'paste', shortcut: 'Ctrl+V',
    onSelect: () => document.execCommand('paste'),
  });

  return items;
}
