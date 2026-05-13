<script setup lang="ts">
import './styles/editor.css';
import './styles/prosemirror.css';
import './styles/nodes.css';
import './styles/slashCommand.css';
import './styles/bubbleMenu.css';
import './styles/dragHandle.css';
import './styles/mathematics.css';
import './styles/tableOfContents.css';
import './styles/wikilink.css';
// KaTeX visual styles for the Mathematics extension. Imported once at
// the editor entry-point so every embed inherits the same typography
// without each host having to remember to wire it manually.
import 'katex/dist/katex.min.css';
import {
  onBeforeUnmount,
  watch,
  computed,
  ref,
  markRaw,
  provide,
  createApp,
  h,
  type App,
  type Component,
} from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import Collaboration from '@tiptap/extension-collaboration';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import type { ContextMenuItem } from '@continuum/shared';
import { buildExtensions } from './extensions';
import type { TocAnchor } from './extensions/TableOfContents';
import type { WikilinkClick } from './extensions/WikilinkDecoration';
import { buildEditorMenu, type PromptRequest } from './editorMenu';
import CodeBlockNodeView from './CodeBlockNodeView.vue';
import DetailsNodeView from './nodes/DetailsNodeView.vue';
import CalloutNodeView from './nodes/CalloutNodeView.vue';
import ChartNodeView from './nodes/ChartNodeView.vue';
import FootnoteNodeView from './nodes/FootnoteNodeView.vue';
import EditorBubbleMenu from './components/EditorBubbleMenu.vue';
import EditorDragHandle from './components/EditorDragHandle.vue';
import {
  ICON_CATALOG_KEY,
  ICON_COMPONENT_KEY,
  SELECT_COMPONENT_KEY,
  type IconCatalogEntry,
} from './hostBridge';
import {
  createDefaultSlashCommands,
  SlashCommandMenu,
  type SlashCommandItem,
  type SlashRendererInstance,
  type SlashRendererProps,
} from './extensions/slashCommand';

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
    /**
     * Catalog of icons surfaced in node-view pickers (e.g. Callout). When
     * omitted the editor falls back to a built-in symbol grid so the
     * package stays usable in isolation.
     */
    iconCatalog?: IconCatalogEntry[];
    /**
     * Vue component used to render an icon by `name`. The host typically
     * passes its own `<Icon name="â€¦" :size="â€¦">` so node-views inherit
     * the app's visual identity.
     */
    iconComponent?: Component | null;
    /**
     * Vue component used to render dropdowns (e.g. the code-block
     * language picker). Expected to mirror the `UiSelect` API:
     * `modelValue`, `options: { label; value }[]`, emits `update:modelValue`.
     */
    selectComponent?: Component | null;
    /**
     * Items shown in the slash-command popup. Defaults to the full
     * Continuum command set (`createDefaultSlashCommands()`); pass an
     * empty array to disable the slash menu entirely, or a custom list
     * to extend / override per host.
     */
    slashCommandItems?: SlashCommandItem[];
    /**
     * When false, the editor becomes read-only: every Tiptap command is
     * rejected, the toolbar buttons disable themselves, NodeViews still
     * render but block their own mutating affordances. Used by the
     * “Lock note” affordance in the host — see `NoteEditorHeader`.
     */
    editable?: boolean;
  }>(),
  {
    mode: 'wysiwyg',
    placeholder: 'Start writing\u2026',
    collaboration: null,
    iconCatalog: () => [],
    iconComponent: null,
    selectComponent: null,
    slashCommandItems: () => createDefaultSlashCommands(),
    editable: true,
  },
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
  /**
   * Fired whenever the document's heading structure changes. Carries
   * the projected `TocAnchor[]` from the TableOfContents extension so
   * hosts (e.g. `NoteTocPanel`) can render an always-up-to-date
   * outline without having to walk the document JSON themselves.
   */
  (e: 'update:toc', anchors: TocAnchor[]): void;
  /**
   * Fired when the user clicks a `[[wikilink]]` chip inside the
   * document. Hosts resolve the target title to an internal id and
   * navigate — the editor itself stays agnostic of the underlying
   * note store.
   */
  (e: 'wikilink-navigate', payload: WikilinkClick): void;
}>();

// ─── Table of Contents ──────────────────────────────────────────────
//
// The TableOfContents extension calls back on every heading change.
// Wrap the emit so the extension wiring stays inside `buildExtensions`
// and the editor body just thinks in terms of a single function ref.
function emitToc(anchors: TocAnchor[]): void {
  emit('update:toc', anchors);
}

/**
 * Public handle exposed via `defineExpose` so a parent can imperatively
 * scroll a heading into view from a sidebar entry. The host receives a
 * `TocAnchor` (carrying the heading's stable `id` attribute, courtesy of
 * the UniqueID extension) and asks the editor to bring the matching
 * heading on screen.
 *
 * Implementation note: we deliberately avoid `setTextSelection(pos)`
 * here. ProseMirror raises “TextSelection endpoint not pointing into a
 * node with inline content (doc)” when `pos` happens to land on a
 * top-level boundary (e.g. just before the first heading), which is
 * exactly the position the TableOfContents extension reports for the
 * very first anchor. Scrolling the rendered DOM node is just as
 * effective and side-effect free — the heading already carries a
 * stable `id` because UniqueID is enabled in the extension pipeline.
 */
function scrollToAnchor(anchor: TocAnchor): void {
  const e = editor.value;
  if (!e) return;
  const dom = e.view.dom.querySelector(`[id="${CSS.escape(anchor.id)}"]`);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

defineExpose({ scrollToAnchor });

const isMarkdown = computed(() => props.mode === 'markdown');

// Make host-provided UI primitives available to all node-views without
// each one importing them directly. Computed-then-watched providers would
// be overkill â€” the catalog and component refs are stable for the
// editor's lifetime in practice, so a single eager `provide` is enough.
provide(ICON_CATALOG_KEY, props.iconCatalog);
if (props.iconComponent) provide(ICON_COMPONENT_KEY, markRaw(props.iconComponent));
if (props.selectComponent) provide(SELECT_COMPONENT_KEY, markRaw(props.selectComponent));

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

/**
 * Slash-menu renderer.
 *
 * Each suggestion session mounts a fresh `SlashCommandMenu` Vue app
 * into a detached `<div>` appended to `document.body`. We re-use the
 * same app for the lifetime of the session and update it via the
 * exposed `propsRef` so reactivity drives re-renders without the cost
 * of unmount/remount on every keystroke. The host's icon catalog and
 * icon component are forwarded through the app's `provide` so the
 * popup shares the same visual identity as the editor proper.
 */
function createSlashRenderer(): SlashRendererInstance {
  let app: App | null = null;
  let container: HTMLDivElement | null = null;
  const liveProps = ref<SlashRendererProps | null>(null);
  // Public handle the popup exposes via `defineExpose` for keyboard nav.
  const popupRef = ref<{ onKeyDown: (p: { event: KeyboardEvent }) => boolean } | null>(null);

  function mount(initial: SlashRendererProps): void {
    container = document.createElement('div');
    container.className = 'continuum-slash-menu-host';
    document.body.appendChild(container);
    liveProps.value = initial;
    app = createApp({
      setup() {
        return () => {
          const p = liveProps.value;
          if (!p) return null;
          return h(SlashCommandMenu, {
            ref: popupRef,
            items: p.items,
            query: p.query,
            clientRect: p.clientRect,
            onCommand: p.command,
          });
        };
      },
    });
    // Forward host UI primitives so the popup uses the same Icon comp.
    app.provide(ICON_CATALOG_KEY, props.iconCatalog);
    if (props.iconComponent) app.provide(ICON_COMPONENT_KEY, markRaw(props.iconComponent));
    app.mount(container);
  }

  function unmount(): void {
    app?.unmount();
    app = null;
    container?.remove();
    container = null;
    liveProps.value = null;
    popupRef.value = null;
  }

  return {
    onStart: (p) => mount(p),
    onUpdate: (p) => {
      liveProps.value = p;
    },
    onKeyDown: ({ event }) => {
      // Escape always closes the menu — let the suggestion plugin handle exit.
      if (event.key === 'Escape') return false;
      return popupRef.value?.onKeyDown({ event }) ?? false;
    },
    onExit: () => unmount(),
  };
}

const editor = useEditor({
  content: collab.value ? '' : props.modelValue,
  editable: props.editable,
  extensions: [
    ...buildExtensions({
      collaborative: !!collab.value,
      placeholder: props.placeholder,
      codeBlockView: markRaw(CodeBlockNodeView),
      detailsView: markRaw(DetailsNodeView),
      calloutView: markRaw(CalloutNodeView),
      chartView: markRaw(ChartNodeView),
      footnoteView: markRaw(FootnoteNodeView),
      mathematics: true,
      tableOfContents: { onUpdate: emitToc },
      wikilink: {
        onNavigate: (link) => emit('wikilink-navigate', link),
      },
      slashCommand: {
        items: props.slashCommandItems,
        render: createSlashRenderer,
      },
    }),
    ...(collab.value && ydoc ? [Collaboration.configure({ document: ydoc })] : []),
  ],
  editorProps: {
    handleKeyDown(view, event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        wrapWikilink();
        return true;
      }
      // Backspace at the very start of a wrapping block (callout,
      // blockquote, codeBlock, details summary/content) should escape the
      // block instead of being a no-op. Without this the cursor is stuck
      // inside the wrapper and the only way out is to drag-select and
      // delete â€” a poor UX for anyone reaching for backspace to "remove
      // this thing I just inserted".
      if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (handleBlockBackspace(view)) {
          event.preventDefault();
          return true;
        }
      }
      return false;
    },
    /**
     * Inline-paste images from the clipboard. The browser exposes them
     * as `image/*` items on the DataTransfer; convert each to a data
     * URL and insert as a regular image node so the rest of the
     * pipeline (selection outline, alignment, replace, delete) keeps
     * working without a dedicated upload service.
     */
    handlePaste(_view, event: ClipboardEvent) {
      if (!props.editable) return false;
      const data = event.clipboardData;
      if (!data || data.files.length === 0) return false;
      const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
      if (!images.length) return false;
      event.preventDefault();
      void insertImagesFromFiles(images);
      return true;
    },
    /**
     * Inline-drop images dragged from the desktop. Same data-URL strategy
     * as paste; we only intercept the event when at least one of the
     * dropped files is an image so non-image drops fall through to
     * Tiptap's default handling (e.g. internal node drag).
     */
    handleDrop(_view, event: DragEvent) {
      if (!props.editable) return false;
      const dt = event.dataTransfer;
      if (!dt || dt.files.length === 0) return false;
      const images = Array.from(dt.files).filter((f) => f.type.startsWith('image/'));
      if (!images.length) return false;
      event.preventDefault();
      void insertImagesFromFiles(images);
      return true;
    },
  },
  onUpdate: () => {
    scheduleEmit();
  },
});

function openContextMenu(ev: MouseEvent): void {
  if (!props.editable) return;
  const e = editor.value;
  if (!e) return;
  ev.preventDefault();
  // Place the caret at the right-click coordinates so context-menu
  // commands (notably table row/column ops) operate on the cell the
  // user actually clicked, not on whatever selection happened to be
  // active before. `posAtCoords` returns null when the click lands in
  // padding outside any node â€” in that case keep the existing selection.
  const view = e.view;
  const pos = view.posAtCoords({ left: ev.clientX, top: ev.clientY });
  if (pos && e.state.selection.empty) {
    e.commands.setTextSelection(pos.pos);
  }
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
  if (!props.editable) return;
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

/**
 * Bridge between the bubble menu's "add link" affordance and the host
 * prompt UI. Re-uses the same `request-prompt` channel as image / link
 * prompts surfaced by the context menu so users always see the same
 * modal styling, regardless of the entry point.
 */
function requestLinkPrompt(): Promise<string | null> {
  return new Promise((resolve) => {
    emit('request-prompt', {
      title: 'Add link',
      label: 'Paste or type a URL',
      placeholder: 'https://example.com',
      confirmLabel: 'Add',
      resolve,
    });
  });
}

/** Block types whose Backspace-at-start should escape the wrapper. */
const ESCAPE_ON_BACKSPACE = new Set([
  'callout',
  'blockquote',
  'codeBlock',
  'details',
  'detailsContent',
  'detailsSummary',
]);

/**
 * Handle Backspace inside special block wrappers.
 *
 * Returns `true` when the keystroke was handled (caller should
 * preventDefault). The rule mirrors Notion: Backspace at the very start
 * of a wrapping block lifts the cursor out (preserving content); when the
 * wrapping block is empty it is removed entirely.
 */
function handleBlockBackspace(view: import('@tiptap/pm/view').EditorView): boolean {
  const e = editor.value;
  if (!e) return false;
  const { state } = view;
  const { selection } = state;
  if (!selection.empty) return false;
  const $from = selection.$from;
  // Only act when the caret is at the very start of its parent text block.
  if ($from.parentOffset !== 0) return false;

  // Walk up the ancestor chain to find the closest "escape" target.
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth);
    const typeName = node.type.name;
    if (!ESCAPE_ON_BACKSPACE.has(typeName)) continue;

    // Special-case the Details node: a backspace inside the summary
    // should remove the whole `details` wrapper, not just the summary.
    if (typeName === 'detailsSummary' || typeName === 'detailsContent') {
      const detailsDepth = depth - 1;
      const detailsNode = detailsDepth >= 0 ? $from.node(detailsDepth) : null;
      if (detailsNode?.type.name === 'details' && isBlockEmpty(detailsNode)) {
        const before = $from.before(detailsDepth);
        const after = $from.after(detailsDepth);
        return e
          .chain()
          .focus()
          .command(({ tr, dispatch }) => {
            if (dispatch) tr.delete(before, after);
            return true;
          })
          .run();
      }
      // Non-empty details: lift the inner block out so caret escapes.
      return e.chain().focus().lift('details').run() || e.chain().focus().selectParentNode().run();
    }

    if (isBlockEmpty(node)) {
      const before = $from.before(depth);
      const after = $from.after(depth);
      return e
        .chain()
        .focus()
        .command(({ tr, dispatch }) => {
          if (dispatch) tr.delete(before, after);
          return true;
        })
        .run();
    }
    // Non-empty wrapper: lift out (callout/blockquote) or convert (codeBlock).
    if (typeName === 'codeBlock') {
      return e.chain().focus().setNode('paragraph').run();
    }
    return e.chain().focus().lift(typeName).run();
  }
  return false;
}

/** A block is considered empty when it has no text and no inline content. */
function isBlockEmpty(node: import('@tiptap/pm/model').Node): boolean {
  if (node.textContent.length > 0) return false;
  if (node.childCount === 0) return true;
  // Recursively ensure every descendant is empty.
  let empty = true;
  node.descendants((child) => {
    if (!empty) return false;
    if (child.isText && child.text && child.text.length > 0) {
      empty = false;
      return false;
    }
    return true;
  });
  return empty;
}

/**
 * Read each file as a data URL and insert as an image node. Sequencing
 * the FileReaders keeps insertion order deterministic when multiple
 * images are pasted at once, and bypasses the need for an upload
 * service on a local-first install.
 */
async function insertImagesFromFiles(files: File[]): Promise<void> {
  const e = editor.value;
  if (!e) return;
  for (const file of files) {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (dataUrl) {
      e.chain().focus().setImage({ src: dataUrl, alt: file.name }).run();
    }
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

// React to editable toggle: pipe straight through to Tiptap so the
// editor surface, the bubble menu, and every NodeView observe the same
// `isEditable` flag without each one needing its own prop.
//
// Pass `emitUpdate=false` so flipping editability does NOT fire a
// transaction event. The default behaviour emits an `update` whose
// debounced echo (`scheduleEmit`) re-emits `update:json` to the host
// during the same Vue flush cycle that already toggled `editable` —
// causing Vue to patch components mid-unmount and crash with
// `insertBefore on null` / `emitsOptions on null`.
watch(
  () => props.editable,
  (value) => {
    editor.value?.setEditable(value, false);
  },
);

const markdownRef = ref<HTMLTextAreaElement | null>(null);

/**
 * Sub-view for source mode: 'source' shows the raw HTML in a textarea,
 * 'preview' renders it read-only with the same `.ProseMirror` styles as
 * the WYSIWYG view so authors can verify formatting without switching
 * the whole editor. Resets back to 'source' whenever the parent leaves
 * source mode so the next entry starts in edit-first state.
 */
const sourceView = ref<'source' | 'preview'>('source');
watch(isMarkdown, (md) => {
  if (!md) sourceView.value = 'source';
});

/**
 * Strip script/style/iframe/object tags and event-handler / javascript:
 * attributes from the HTML before injecting it as preview. The editor
 * never produces these via Tiptap; this is defence-in-depth against
 * pasted or hand-edited content. Full XSS hardening would warrant a
 * library like DOMPurify, but the current surface (local-first, single
 * trusted user) makes a focused regex pass acceptable.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*\/?\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='#'");
}

const sanitizedPreview = computed(() => sanitizeHtml(props.modelValue || ''));

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
  if (!props.editable) return;
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
</script>

<template>
  <div class="continuum-editor" :class="{ 'is-markdown': isMarkdown, 'is-readonly': !editable }">
    <template v-if="!isMarkdown">
      <!-- Live-collab badge sits in its own status row above the canvas
           so the writing surface remains free of permanent chrome. The
           bubble menu (`EditorBubbleMenu`) now owns every formatting
           command, surfaced contextually on the user's selection. -->
      <div v-if="collab && editor && editable" class="status-bar" aria-label="Editor status">
        <span class="live" aria-label="Live collaboration active">
          <span class="live-dot" />Live
        </span>
      </div>
      <EditorContent :editor="editor" class="content" @contextmenu="openContextMenu" />
      <!-- Floating affordances: drag handle in the gutter, bubble menu
           on the active selection. Both stay mounted regardless of the
           editable flag — they self-suppress through the underlying
           Tiptap plugins (`shouldShow` for the bubble, `isEditable`
           for the drag handle). Toggling the wrapper via `v-if` would
           tear down their body-portaled Tippy popups mid-patch and
           crash Vue's reconciler. -->
      <EditorDragHandle v-if="editor" :editor="editor" />
      <EditorBubbleMenu v-if="editor" :editor="editor" :request-link="requestLinkPrompt" />
    </template>

    <template v-else>
      <div class="md-hint" role="toolbar" aria-label="Source view">
        <span class="md-hint__label">HTML source</span>
        <div class="md-view-switch" role="group" aria-label="Source / preview">
          <button type="button" class="md-view-btn" :class="{ active: sourceView === 'source' }"
            @click="sourceView = 'source'">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
                d="m6 5l-3 3l3 3m4-6l3 3l-3 3" />
            </svg>
            Source
          </button>
          <button type="button" class="md-view-btn" :class="{ active: sourceView === 'preview' }"
            @click="sourceView = 'preview'">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
                d="M1 8s2.5-5 7-5s7 5 7 5s-2.5 5-7 5s-7-5-7-5z" />
              <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.4" />
            </svg>
            Preview
          </button>
        </div>
      </div>
      <textarea v-show="sourceView === 'source'" ref="markdownRef" class="content md-area" :value="modelValue"
        :placeholder="placeholder" spellcheck="false" :readonly="!editable" @input="onMarkdownInput" />
      <!-- Read-only preview: renders the same HTML the WYSIWYG would emit so
           authors can verify their source edits without leaving source mode.
           Uses .ProseMirror so saved tiptap styles apply identically. -->
      <div v-if="sourceView === 'preview'" class="content md-preview ProseMirror" v-html="sanitizedPreview" />
    </template>
  </div>
</template>
