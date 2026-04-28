<script setup lang="ts">
import { onBeforeUnmount, watch, computed, ref, markRaw } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import Collaboration from '@tiptap/extension-collaboration';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import type { ContextMenuItem } from '@continuum/shared';
import { buildExtensions } from './extensions';
import { buildEditorMenu, type PromptRequest } from './editorMenu';
import CodeBlockNodeView from './CodeBlockNodeView.vue';
import DetailsNodeView from './nodes/DetailsNodeView.vue';

interface CollaborationConfig {
  documentId: string;
  wsUrl: string;
  token?: string;
}

type EditorMode = 'wysiwyg' | 'markdown';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    mode?: EditorMode;
    placeholder?: string;
    collaboration?: CollaborationConfig | null;
  }>(),
  { mode: 'wysiwyg', placeholder: 'Start writing…', collaboration: null },
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:json', value: unknown): void;
  /**
   * Fired when the user right-clicks the editor surface. The host can
   * render the supplied items via `UiContextMenu`. Coordinates are in
   * viewport space (event.clientX/Y).
   */
  (e: 'request-context-menu', payload: { x: number; y: number; items: ContextMenuItem[] }): void;
  /**
   * Fired when the editor needs a single-line text input from the user
   * (e.g. image URL, link URL). The host renders its own prompt UI and
   * invokes `resolve(value)` with a string, or `resolve(null)` to cancel.
   */
  (e: 'request-prompt', payload: PromptRequest): void;
}>();

const isMarkdown = computed(() => props.mode === 'markdown');

// Collaboration is only valid in WYSIWYG mode.
const collab = computed<CollaborationConfig | null>(() => {
  if (isMarkdown.value && props.collaboration) {
    // eslint-disable-next-line no-console
    console.warn('[ContinuumEditor] collaboration ignored in markdown mode');
    return null;
  }
  return props.collaboration ?? null;
});

let ydoc: Y.Doc | null = null;
let provider: HocuspocusProvider | null = null;

if (!isMarkdown.value && collab.value) {
  ydoc = new Y.Doc();
  provider = new HocuspocusProvider({
    url: collab.value.wsUrl,
    name: collab.value.documentId,
    document: ydoc,
    token: collab.value.token,
  });
}

const editor = useEditor({
  content: collab.value ? '' : props.modelValue,
  extensions: [
    ...buildExtensions({
      collaborative: !!collab.value,
      placeholder: props.placeholder,
      codeBlockView: markRaw(CodeBlockNodeView),
      detailsView: markRaw(DetailsNodeView),
    }),
    ...(collab.value && ydoc ? [Collaboration.configure({ document: ydoc })] : []),
  ],
  editorProps: {
    handleKeyDown(_view, event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        wrapWikilink();
        return true;
      }
      return false;
    },
  },
  onUpdate: () => {
    scheduleEmit();
  },
});

function openContextMenu(ev: MouseEvent): void {
  const e = editor.value;
  if (!e) return;
  ev.preventDefault();
  const inCodeBlock = e.isActive('codeBlock');
  const codeLanguage = inCodeBlock
    ? ((e.getAttributes('codeBlock').language as string | undefined) ?? 'plaintext')
    : null;
  const requestPrompt = (opts: Omit<PromptRequest, 'resolve'>): Promise<string | null> =>
    new Promise((resolve) => {
      emit('request-prompt', { ...opts, resolve });
    });
  const items = buildEditorMenu({
    editor: e,
    inCodeBlock,
    codeLanguage,
    hasSelection: !e.state.selection.empty,
    requestPrompt,
  });
  emit('request-context-menu', { x: ev.clientX, y: ev.clientY, items });
}

// Debounce HTML/JSON serialization. For very large documents, getHTML() and
// getJSON() are O(n) over the whole ProseMirror tree; running them on every
// keystroke causes visible typing lag. Coalesce into a single emit per ~200ms
// idle window, and flush synchronously on unmount so nothing is lost.
let emitTimer: ReturnType<typeof setTimeout> | null = null;
let emitDirty = false;

function flushEmit(): void {
  if (emitTimer !== null) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  if (!emitDirty) return;
  emitDirty = false;
  const e = editor.value;
  if (!e) return;
  emit('update:modelValue', e.getHTML());
  emit('update:json', e.getJSON());
}

function scheduleEmit(): void {
  emitDirty = true;
  if (emitTimer !== null) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    flushEmit();
  }, 200);
}

function wrapWikilink(): void {
  const e = editor.value;
  if (!e) return;
  const { from, to, empty } = e.state.selection;
  if (empty) {
    e.chain().focus().insertContent('[[]]').setTextSelection(from + 2).run();
  } else {
    const text = e.state.doc.textBetween(from, to, ' ');
    e.chain().focus().insertContentAt({ from, to }, `[[${text}]]`).run();
  }
}

// Keep external v-model in sync only when not in collab mode.
watch(
  () => props.modelValue,
  (val) => {
    if (collab.value) return;
    if (editor.value && val !== editor.value.getHTML()) {
      editor.value.commands.setContent(val, false);
    }
  },
);

// React to mode changes: when returning to wysiwyg, push markdown source into the editor.
watch(
  () => props.mode,
  (next, prev) => {
    if (next === prev) return;
    if (next === 'wysiwyg' && editor.value) {
      editor.value.commands.setContent(props.modelValue || '', false);
    }
  },
);

const markdownRef = ref<HTMLTextAreaElement | null>(null);

let mdEmitTimer: ReturnType<typeof setTimeout> | null = null;
let mdPendingValue: string | null = null;

function flushMdEmit(): void {
  if (mdEmitTimer !== null) {
    clearTimeout(mdEmitTimer);
    mdEmitTimer = null;
  }
  if (mdPendingValue === null) return;
  emit('update:modelValue', mdPendingValue);
  mdPendingValue = null;
}

function onMarkdownInput(ev: Event): void {
  const target = ev.target as HTMLTextAreaElement;
  mdPendingValue = target.value;
  if (mdEmitTimer !== null) return;
  mdEmitTimer = setTimeout(() => {
    mdEmitTimer = null;
    flushMdEmit();
  }, 150);
}

onBeforeUnmount(() => {
  flushEmit();
  editor.value?.destroy();
  provider?.destroy();
  ydoc?.destroy();
});

function toggle(cmd: string): void {
  const e = editor.value;
  if (!e) return;
  const chain = e.chain().focus();
  switch (cmd) {
    case 'bold': chain.toggleBold().run(); break;
    case 'italic': chain.toggleItalic().run(); break;
    case 'underline': chain.toggleUnderline().run(); break;
    case 'strike': chain.toggleStrike().run(); break;
    case 'code': chain.toggleCode().run(); break;
    case 'h1': chain.toggleHeading({ level: 1 }).run(); break;
    case 'h2': chain.toggleHeading({ level: 2 }).run(); break;
    case 'h3': chain.toggleHeading({ level: 3 }).run(); break;
    case 'bulletList': chain.toggleBulletList().run(); break;
    case 'orderedList': chain.toggleOrderedList().run(); break;
    case 'taskList': chain.toggleTaskList().run(); break;
    case 'blockquote': chain.toggleBlockquote().run(); break;
    case 'codeBlock': chain.toggleCodeBlock().run(); break;
    case 'hr': chain.setHorizontalRule().run(); break;
    case 'wikilink': wrapWikilink(); break;
  }
}

function isActive(name: string, attrs?: Record<string, unknown>): boolean {
  return editor.value?.isActive(name, attrs) ?? false;
}
</script>

<template>
  <div class="lore-editor" :class="{ 'is-markdown': isMarkdown }">
    <template v-if="!isMarkdown">
      <div class="toolbar" v-if="editor" role="toolbar" aria-label="Formatting">
        <div class="tb-group">
          <button class="tb-btn" :class="{ active: isActive('bold') }" @click="toggle('bold')" title="Bold (Ctrl+B)"
            aria-label="Bold">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor"
                d="M4 2.5h4.25a3 3 0 0 1 1.94 5.29A3.25 3.25 0 0 1 8.75 13.5H4zm1.75 4.25h2.4a1.25 1.25 0 0 0 0-2.5H5.75zm0 5h2.9a1.5 1.5 0 0 0 0-3H5.75z" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('italic') }" @click="toggle('italic')"
            title="Italic (Ctrl+I)" aria-label="Italic">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M6.5 2.5h5v1.5H9.7l-2 8H10v1.5H4.5V12h2.05l2-8H6.5z" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('underline') }" @click="toggle('underline')"
            title="Underline (Ctrl+U)" aria-label="Underline">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor"
                d="M4 2.5h1.5v6.25a2.5 2.5 0 0 0 5 0V2.5H12v6.4a4 4 0 0 1-8 0zM3.5 13h9v1.25h-9z" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('strike') }" @click="toggle('strike')" title="Strikethrough"
            aria-label="Strikethrough">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor"
                d="M2 8.25h12v1.25H2zm5.5-4.75c-2 0-3.25 1-3.25 2.5q0 .55.2 1h1.6q-.3-.35-.3-.85c0-.85.65-1.35 1.7-1.35.95 0 1.6.45 1.7 1.2h1.55C10.55 4.45 9.25 3.5 7.5 3.5m1 9c2.05 0 3.25-1 3.25-2.45 0-.4-.1-.7-.25-.95H9.95q.3.4.3.95c0 .85-.7 1.4-1.7 1.4-1.1 0-1.85-.55-1.95-1.4H5.05c.1 1.55 1.4 2.45 3.45 2.45" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('code') }" @click="toggle('code')" title="Inline code"
            aria-label="Inline code">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
                d="m6 5l-3 3l3 3m4-6l3 3l-3 3" />
            </svg>
          </button>
        </div>

        <span class="sep" />

        <div class="tb-group">
          <button class="tb-btn tb-btn--text" :class="{ active: isActive('heading', { level: 1 }) }"
            @click="toggle('h1')" title="Heading 1" aria-label="Heading 1">H1</button>
          <button class="tb-btn tb-btn--text" :class="{ active: isActive('heading', { level: 2 }) }"
            @click="toggle('h2')" title="Heading 2" aria-label="Heading 2">H2</button>
          <button class="tb-btn tb-btn--text" :class="{ active: isActive('heading', { level: 3 }) }"
            @click="toggle('h3')" title="Heading 3" aria-label="Heading 3">H3</button>
        </div>

        <span class="sep" />

        <div class="tb-group">
          <button class="tb-btn" :class="{ active: isActive('bulletList') }" @click="toggle('bulletList')"
            title="Bullet list" aria-label="Bullet list">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor"
                d="M2 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0m0 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0m0 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0M6 3.5h8v1H6zm0 4h8v1H6zm0 4h8v1H6z" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('orderedList') }" @click="toggle('orderedList')"
            title="Numbered list" aria-label="Numbered list">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor"
                d="M6 3.5h8v1H6zm0 4h8v1H6zm0 4h8v1H6zM2 2.5h1.5v3H3v-2h-.5zm0 4h1.5v.6L2.6 8h.9v.5H2v-.6L2.9 7H2zm0 3.5h1.5v.5H2.5v.5h.6q.4 0 .4.4v.6q0 .4-.4.4H2v-.5h1v-.5h-.6q-.4 0-.4-.4z" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('taskList') }" @click="toggle('taskList')"
            title="To-do list" aria-label="To-do list">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
                d="M2.5 4.5h2v2h-2zM2.5 9.5h2v2h-2zM7 5.5h7M7 10.5h7" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('blockquote') }" @click="toggle('blockquote')" title="Quote"
            aria-label="Quote">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor"
                d="M3 4.5h4v4q0 2-2 3l-.5-1q1.2-.5 1.4-1.5H3zm6 0h4v4q0 2-2 3l-.5-1q1.2-.5 1.4-1.5H9z" />
            </svg>
          </button>
          <button class="tb-btn" :class="{ active: isActive('codeBlock') }" @click="toggle('codeBlock')"
            title="Code block" aria-label="Code block">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"
                d="M2 3.5h12v9H2zM5 6L3 8l2 2m6-4l2 2l-2 2" />
            </svg>
          </button>
          <button class="tb-btn" @click="toggle('hr')" title="Horizontal rule" aria-label="Horizontal rule">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M2 7.5h12v1H2z" />
            </svg>
          </button>
        </div>

        <span class="sep" />

        <div class="tb-group">
          <button class="tb-btn tb-btn--text" @click="toggle('wikilink')" title="Wrap in [[ ]] (Ctrl+K)"
            aria-label="Wikilink">[[ ]]</button>
        </div>

        <span v-if="collab" class="live" aria-label="Live collaboration active">
          <span class="live-dot" />Live
        </span>
      </div>
      <EditorContent :editor="editor" class="content" @contextmenu="openContextMenu" />
    </template>

    <template v-else>
      <div class="md-hint">Markdown source</div>
      <textarea ref="markdownRef" class="content md-area" :value="modelValue" :placeholder="placeholder"
        spellcheck="false" @input="onMarkdownInput" />
    </template>
  </div>
</template>

<style>
.lore-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  flex: 1 1 0;
  min-height: 0;
}

.lore-editor .toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elev);
}

.lore-editor .toolbar .tb-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.lore-editor .toolbar .tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: var(--border-width-1) solid transparent;
  color: var(--fg-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.01em;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.lore-editor .toolbar .tb-btn--text {
  width: auto;
  min-width: 28px;
  padding: 0 var(--space-3);
}

.lore-editor .toolbar .tb-btn:hover {
  background: var(--bg-soft);
  color: var(--fg);
}

.lore-editor .toolbar .tb-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.lore-editor .toolbar .sep {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.lore-editor .toolbar .live {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
  padding: 2px var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--success-soft, var(--bg-soft));
  color: var(--success);
  font-size: var(--text-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.lore-editor .toolbar .live-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-circle);
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 25%, transparent);
}

.lore-editor .content {
  /* The pane already provides the surface + radius; the editor becomes a
     calmer, frameless writing area. */
  padding: var(--space-6) var(--space-2);
  background: transparent;
  color: var(--fg);
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  font-size: var(--text-md);
  line-height: var(--leading-relaxed);
}

.lore-editor .md-hint {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--fg-subtle);
  padding: 0 var(--space-2);
}

.lore-editor .md-area {
  width: 100%;
  resize: none;
  font-family: var(--font-mono);
  font-size: var(--text-md);
  line-height: var(--leading-relaxed);
  outline: none;
  background: var(--bg-elev);
  color: var(--fg);
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}

.lore-editor .md-area:focus {
  outline: none;
  border-color: var(--border-strong);
  box-shadow: none;
}

.lore-editor .ProseMirror {
  outline: none;
  min-height: 100%;
}

.lore-editor .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--fg-subtle);
  float: left;
  pointer-events: none;
  height: 0;
}

.lore-editor .ProseMirror h1 {
  font-size: var(--text-3xl);
  margin: 0.5em 0 0.3em;
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
  letter-spacing: var(--tracking-tight);
}

.lore-editor .ProseMirror h2 {
  font-size: var(--text-2xl);
  margin: 0.5em 0 0.3em;
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
}

.lore-editor .ProseMirror h3 {
  font-size: var(--text-xl);
  margin: 0.5em 0 0.3em;
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
}

.lore-editor .ProseMirror p {
  margin: 0.5em 0;
  line-height: var(--leading-relaxed);
}

.lore-editor .ProseMirror code {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 1px var(--space-3);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.lore-editor .ProseMirror pre {
  background: var(--bg-soft);
  padding: var(--space-7) var(--space-8);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-family: var(--font-mono);
  border: var(--border-width-1) solid var(--border);
}

.lore-editor .ProseMirror blockquote {
  border-left: 3px solid var(--accent);
  padding-left: var(--space-7);
  color: var(--fg-muted);
  margin: 0.6em 0;
}

.lore-editor .ProseMirror a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.lore-editor .ProseMirror ul,
.lore-editor .ProseMirror ol {
  padding-left: 1.4em;
}

.lore-editor .ProseMirror hr {
  border: none;
  border-top: var(--border-width-1) solid var(--border);
  margin: 1em 0;
}

/* ── Task list ───────────────────────────────────────────────── */
.lore-editor .ProseMirror ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.lore-editor .ProseMirror ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  margin: var(--space-2) 0;
}

.lore-editor .ProseMirror ul[data-type="taskList"] li>label {
  flex: 0 0 auto;
  user-select: none;
  margin-top: 4px;
}

.lore-editor .ProseMirror ul[data-type="taskList"] li>div {
  flex: 1;
  min-width: 0;
}

.lore-editor .ProseMirror ul[data-type="taskList"] input[type="checkbox"] {
  appearance: none;
  width: 16px;
  height: 16px;
  border: var(--border-width-1) solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: var(--bg-elev);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
  margin: 0;
  padding: 0;
}

.lore-editor .ProseMirror ul[data-type="taskList"] input[type="checkbox"]:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.lore-editor .ProseMirror ul[data-type="taskList"] input[type="checkbox"]:checked::after {
  content: '';
  width: 9px;
  height: 5px;
  border-left: 2px solid var(--fg-on-accent, #fff);
  border-bottom: 2px solid var(--fg-on-accent, #fff);
  transform: rotate(-45deg) translate(1px, -1px);
}

.lore-editor .ProseMirror li[data-checked="true"]>div {
  color: var(--fg-subtle);
  text-decoration: line-through;
}

/* ── Tables ──────────────────────────────────────────────────── */
.lore-editor .ProseMirror table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: 0.6em 0;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: var(--border-width-1) solid var(--border);
}

.lore-editor .ProseMirror table td,
.lore-editor .ProseMirror table th {
  border: var(--border-width-1) solid var(--border);
  padding: var(--space-3) var(--space-5);
  vertical-align: top;
  position: relative;
  min-width: 60px;
}

.lore-editor .ProseMirror table th {
  background: var(--bg-soft);
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
  text-align: left;
}

.lore-editor .ProseMirror table .selectedCell {
  background: var(--accent-soft);
}

.lore-editor .ProseMirror table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent);
  pointer-events: none;
}

/* ── Images ──────────────────────────────────────────────────── */
.lore-editor .ProseMirror img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-md);
  border: var(--border-width-1) solid var(--border);
  display: block;
  margin: 0.6em 0;
}

.lore-editor .ProseMirror img[data-align="left"] {
  margin-left: 0;
  margin-right: auto;
}

.lore-editor .ProseMirror img[data-align="center"] {
  margin-left: auto;
  margin-right: auto;
}

.lore-editor .ProseMirror img[data-align="right"] {
  margin-left: auto;
  margin-right: 0;
}

.lore-editor .ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid var(--accent);
}

/* ── Highlights / inline color ───────────────────────────────── */
.lore-editor .ProseMirror mark {
  border-radius: var(--radius-xs);
  padding: 0 2px;
}

/* ── Callout ─────────────────────────────────────────────────── */
.lore-editor .ProseMirror .lore-callout {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: var(--space-4);
  margin: 0.6em 0;
  padding: var(--space-4) var(--space-5);
  background: var(--bg-soft);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
}

.lore-editor .ProseMirror .lore-callout__emoji {
  font-size: 1.25em;
  line-height: 1.4;
  user-select: none;
}

.lore-editor .ProseMirror .lore-callout__body> :first-child {
  margin-top: 0;
}

.lore-editor .ProseMirror .lore-callout__body> :last-child {
  margin-bottom: 0;
}

/* ── Details / Toggle ────────────────────────────────────────── */
/* Visual styling lives inside DetailsNodeView.vue (scoped). Nothing here. */

/* ── Text alignment ──────────────────────────────────────────── */
.lore-editor .ProseMirror [style*="text-align: center"] {
  text-align: center;
}

.lore-editor .ProseMirror [style*="text-align: right"] {
  text-align: right;
}

.lore-editor .ProseMirror [style*="text-align: justify"] {
  text-align: justify;
}

/* ── Lowlight syntax tokens (theme-aware) ────────────────────── */
.lore-code-block .hljs-comment,
.lore-code-block .hljs-quote {
  color: var(--fg-subtle);
  font-style: italic;
}

.lore-code-block .hljs-keyword,
.lore-code-block .hljs-selector-tag,
.lore-code-block .hljs-literal {
  color: var(--accent);
}

.lore-code-block .hljs-number,
.lore-code-block .hljs-string,
.lore-code-block .hljs-doctag {
  color: var(--success, #16a34a);
}

.lore-code-block .hljs-title,
.lore-code-block .hljs-section,
.lore-code-block .hljs-built_in,
.lore-code-block .hljs-name {
  color: var(--warning, #d97706);
}

.lore-code-block .hljs-variable,
.lore-code-block .hljs-template-variable,
.lore-code-block .hljs-attr,
.lore-code-block .hljs-attribute {
  color: var(--fg-strong);
}

.lore-code-block .hljs-meta,
.lore-code-block .hljs-tag {
  color: var(--fg-muted);
}

.lore-code-block .hljs-emphasis {
  font-style: italic;
}

.lore-code-block .hljs-strong {
  font-weight: var(--font-weight-semibold);
}
</style>
