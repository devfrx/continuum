<script setup lang="ts">
/**
 * EditorBubbleMenu
 * ────────────────────────────────────────────────────────────────────
 * Floating, selection-anchored toolbar that owns *every* formatting
 * action the WYSIWYG surface exposes. Replaces the old top-of-editor
 * toolbar so the writing canvas stays fully chrome-free until the
 * user makes a selection.
 *
 * Built on the `BubbleMenu` Vue component shipped inside `@tiptap/vue-3`
 * (the framework wrapper around `@tiptap/extension-bubble-menu`) so we
 * never instantiate the underlying plugin manually. Compound commands
 * (heading level, list type, alignment, block conversion, colour…)
 * are surfaced through the `BubbleMenuPopover` helper to keep the row
 * compact while preserving discoverability.
 *
 * Visibility rules:
 *   • Hidden when the editor is read-only.
 *   • Hidden when the selection is empty.
 *   • Hidden inside code blocks (formatting marks have no effect there);
 *     the only popover that still surfaces is the block converter, but
 *     we hide the whole menu rather than ship a code-only mini-version
 *     because the slash menu and the context menu already cover that
 *     case.
 */
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/vue-3';
import { TextSelection } from '@tiptap/pm/state';
import BubbleMenuPopover from './BubbleMenuPopover.vue';

const props = defineProps<{
  editor: Editor;
  /**
   * Optional callback invoked when the user activates the link
   * command. The host is expected to surface its own prompt UI
   * (re-using the same `request-prompt` channel as the rest of the
   * editor) and resolve with the entered URL or `null` to cancel.
   */
  requestLink?: () => Promise<string | null>;
  /**
   * Same contract as `requestLink`, but tailored to the image command.
   * When omitted, the bubble falls back to a `window.prompt` so the
   * action remains usable in isolated embeds.
   */
  requestImage?: () => Promise<string | null>;
}>();

// ─── Helpers ────────────────────────────────────────────────────────
function isActive(name: string, attrs?: Record<string, unknown>): boolean {
  return props.editor.isActive(name, attrs);
}
/**
 * Attribute-only `isActive` lookup. Useful for marks (e.g. text
 * alignment) that are queried purely via attribute matching without a
 * specific node/mark name.
 */
function isAttrActive(attrs: Record<string, unknown>): boolean {
  return (props.editor.isActive as (a: Record<string, unknown>) => boolean)(attrs);
}
function chain() {
  return props.editor.chain().focus();
}

async function toggleLink(): Promise<void> {
  if (props.editor.isActive('link')) {
    chain().unsetLink().run();
    return;
  }
  const url = props.requestLink ? await props.requestLink() : window.prompt('Link URL');
  if (url) chain().setLink({ href: url }).run();
}

async function insertImage(): Promise<void> {
  const src = props.requestImage ? await props.requestImage() : window.prompt('Image URL');
  if (src) chain().setImage({ src }).run();
}

function insertWikilink(): void {
  const e = props.editor;
  const { from, to, empty } = e.state.selection;
  if (empty) {
    chain().insertContent('[[]]').setTextSelection(from + 2).run();
  } else {
    const text = e.state.doc.textBetween(from, to, ' ');
    chain().insertContentAt({ from, to }, `[[${text}]]`).run();
  }
}

// ─── Block / heading conversion ─────────────────────────────────────
type HeadingLevel = 1 | 2 | 3 | 4;
const HEADING_LEVELS: { level: HeadingLevel; label: string }[] = [
  { level: 1, label: 'H1' },
  { level: 2, label: 'H2' },
  { level: 3, label: 'H3' },
  { level: 4, label: 'H4' },
];

function setHeading(level: HeadingLevel): void {
  chain().toggleHeading({ level }).run();
}

function setParagraph(): void {
  chain().setParagraph().run();
}

function activeBlockLabel(): string {
  for (const h of HEADING_LEVELS) {
    if (isActive('heading', { level: h.level })) return h.label;
  }
  if (isActive('blockquote')) return 'Quote';
  if (isActive('codeBlock')) return 'Code';
  if (isActive('callout')) return 'Callout';
  if (isActive('details')) return 'Toggle';
  return 'P';
}

// ─── Alignment ──────────────────────────────────────────────────────
type AlignValue = 'left' | 'center' | 'right' | 'justify';
const ALIGN_OPTIONS: { value: AlignValue; label: string; path: string }[] = [
  { value: 'left', label: 'Align left', path: 'M2 3.5h12M2 7h8M2 10.5h12M2 14h6' },
  { value: 'center', label: 'Align center', path: 'M2 3.5h12M4 7h8M2 10.5h12M5 14h6' },
  { value: 'right', label: 'Align right', path: 'M2 3.5h12M6 7h8M2 10.5h12M8 14h6' },
  { value: 'justify', label: 'Justify', path: 'M2 3.5h12M2 7h12M2 10.5h12M2 14h12' },
];

function setAlign(value: AlignValue): void {
  chain().setTextAlign(value).run();
}

function activeAlignValue(): AlignValue {
  for (const a of ALIGN_OPTIONS) {
    if (isAttrActive({ textAlign: a.value })) return a.value;
  }
  return 'left';
}

// ─── Colour & highlight ─────────────────────────────────────────────
const TEXT_COLORS = [
  { label: 'Default', value: null },
  { label: 'Muted', value: 'var(--fg-muted)' },
  { label: 'Accent', value: 'var(--accent)' },
  { label: 'Success', value: 'var(--success)' },
  { label: 'Warning', value: 'var(--warning)' },
  { label: 'Danger', value: 'var(--danger)' },
];

const HIGHLIGHTS = [
  { label: 'None', value: null },
  { label: 'Yellow', value: '#fff59d' },
  { label: 'Green', value: '#c5e1a5' },
  { label: 'Blue', value: '#90caf9' },
  { label: 'Pink', value: '#f48fb1' },
  { label: 'Purple', value: '#ce93d8' },
];

function setColor(value: string | null): void {
  if (value === null) chain().unsetColor().run();
  else chain().setColor(value).run();
}

function setHighlight(value: string | null): void {
  if (value === null) chain().unsetHighlight().run();
  else chain().toggleHighlight({ color: value }).run();
}

// ─── Visibility ─────────────────────────────────────────────────────
function shouldShow({
  editor,
  state,
}: {
  editor: Editor;
  state: { selection: { empty: boolean } };
}): boolean {
  if (!editor.isEditable) return false;
  // Only surface the menu for true text selections. The drag-handle
  // plugin installs a NodeSelection on the grabbed block while the
  // user repositions it; treating that as a "selection" would make
  // the bubble flash on every drop.
  if (!(state.selection instanceof TextSelection)) return false;
  if (state.selection.empty) return false;
  if (editor.isActive('codeBlock')) return false;
  return true;
}

// Tippy popper config kept in script context so `document` is
// resolved against the real window (vue-tsc cannot see globals
// referenced from inline templates).
const tippyOptions = {
  duration: 120,
  placement: 'top-start' as const,
  maxWidth: 'min(640px, calc(100vw - 24px))',
  interactive: true,
  hideOnClick: false,
  zIndex: 120,
  popperOptions: {
    modifiers: [
      {
        name: 'preventOverflow',
        options: { boundary: 'viewport', padding: 12 },
      },
      {
        name: 'flip',
        options: { padding: 12 },
      },
    ],
  },
  appendTo: () => document.body,
};
</script>

<template>
  <BubbleMenu :editor="editor" :should-show="shouldShow" :update-delay="80" :tippy-options="tippyOptions">
    <div class="continuum-bubble-menu" role="toolbar" aria-label="Inline formatting">
      <!-- Block / heading converter ------------------------------- -->
      <BubbleMenuPopover :label="`Block: ${activeBlockLabel()}`" no-chevron>
        <template #trigger>
          <span class="bm-block-label">{{ activeBlockLabel() }}</span>
        </template>
        <template #default="{ close }">
          <button type="button" class="bm-menu-item" :class="{ active: isActive('paragraph') && !isActive('heading') }"
            @pointerdown.prevent="setParagraph(); close()">
            <span class="bm-menu-item__label">Paragraph</span>
            <kbd class="bm-menu-item__hint">P</kbd>
          </button>
          <button v-for="h in HEADING_LEVELS" :key="h.level" type="button" class="bm-menu-item"
            :class="{ active: isActive('heading', { level: h.level }) }"
            @pointerdown.prevent="setHeading(h.level); close()">
            <span class="bm-menu-item__label">Heading {{ h.level }}</span>
            <kbd class="bm-menu-item__hint">{{ h.label }}</kbd>
          </button>
          <div class="bm-menu-divider" role="separator" />
          <button type="button" class="bm-menu-item" :class="{ active: isActive('blockquote') }"
            @pointerdown.prevent="chain().toggleBlockquote().run(); close()">
            <span class="bm-menu-item__label">Quote</span>
          </button>
          <button type="button" class="bm-menu-item" :class="{ active: isActive('codeBlock') }"
            @pointerdown.prevent="chain().toggleCodeBlock().run(); close()">
            <span class="bm-menu-item__label">Code block</span>
          </button>
          <button type="button" class="bm-menu-item"
            @pointerdown.prevent="chain().setHorizontalRule().run(); close()">
            <span class="bm-menu-item__label">Divider</span>
          </button>
        </template>
      </BubbleMenuPopover>

      <span class="bm-sep" />

      <!-- Inline marks --------------------------------------------- -->
      <button type="button" class="bm-btn" :class="{ active: isActive('bold') }"
        @pointerdown.prevent="chain().toggleBold().run()" title="Bold (Ctrl+B)" aria-label="Bold">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor"
            d="M4 2.5h4.25a3 3 0 0 1 1.94 5.29A3.25 3.25 0 0 1 8.75 13.5H4zm1.75 4.25h2.4a1.25 1.25 0 0 0 0-2.5H5.75zm0 5h2.9a1.5 1.5 0 0 0 0-3H5.75z" />
        </svg>
      </button>
      <button type="button" class="bm-btn" :class="{ active: isActive('italic') }"
        @pointerdown.prevent="chain().toggleItalic().run()" title="Italic (Ctrl+I)" aria-label="Italic">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M6.5 2.5h5v1.5H9.7l-2 8H10v1.5H4.5V12h2.05l2-8H6.5z" />
        </svg>
      </button>
      <button type="button" class="bm-btn" :class="{ active: isActive('underline') }"
        @pointerdown.prevent="chain().toggleUnderline().run()" title="Underline (Ctrl+U)" aria-label="Underline">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor"
            d="M4 2.5h1.5v6.25a2.5 2.5 0 0 0 5 0V2.5H12v6.4a4 4 0 0 1-8 0zM3.5 13h9v1.25h-9z" />
        </svg>
      </button>
      <button type="button" class="bm-btn" :class="{ active: isActive('strike') }"
        @pointerdown.prevent="chain().toggleStrike().run()" title="Strikethrough" aria-label="Strikethrough">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="currentColor"
            d="M2 8.25h12v1.25H2zm5.5-4.75c-2 0-3.25 1-3.25 2.5q0 .55.2 1h1.6q-.3-.35-.3-.85c0-.85.65-1.35 1.7-1.35.95 0 1.6.45 1.7 1.2h1.55C10.55 4.45 9.25 3.5 7.5 3.5m1 9c2.05 0 3.25-1 3.25-2.45 0-.4-.1-.7-.25-.95H9.95q.3.4.3.95c0 .85-.7 1.4-1.7 1.4-1.1 0-1.85-.55-1.95-1.4H5.05c.1 1.55 1.4 2.45 3.45 2.45" />
        </svg>
      </button>
      <button type="button" class="bm-btn" :class="{ active: isActive('code') }"
        @pointerdown.prevent="chain().toggleCode().run()" title="Inline code" aria-label="Inline code">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
            d="m6 5l-3 3l3 3m4-6l3 3l-3 3" />
        </svg>
      </button>

      <span class="bm-sep" />

      <!-- Link / wikilink / image ---------------------------------- -->
      <button type="button" class="bm-btn" :class="{ active: isActive('link') }"
        @pointerdown.prevent="toggleLink"
        :title="isActive('link') ? 'Remove link' : 'Add link'" aria-label="Toggle link">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
            d="M6.5 9.5L9.5 6.5M7 5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1m-5 1l-1 1A2.5 2.5 0 0 0 8 13l1-1" />
        </svg>
      </button>
      <button type="button" class="bm-btn" @pointerdown.prevent="insertWikilink"
        title="Wrap in [[ ]] (Ctrl+K)" aria-label="Wikilink">
        <span class="bm-btn__text">[[ ]]</span>
      </button>
      <button type="button" class="bm-btn" @pointerdown.prevent="insertImage"
        title="Insert image" aria-label="Insert image">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"
            d="M2 3.5h12v9H2zM2 11l3.5-3.5l3 3l2-2L14 11" />
          <circle cx="6" cy="6" r="1.2" fill="currentColor" />
        </svg>
      </button>

      <span class="bm-sep" />

      <!-- Lists ---------------------------------------------------- -->
      <BubbleMenuPopover label="Lists">
        <template #trigger>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path fill="currentColor"
              d="M2 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0m0 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0m0 4a1 1 0 1 1 2 0 1 1 0 0 1-2 0M6 3.5h8v1H6zm0 4h8v1H6zm0 4h8v1H6z" />
          </svg>
        </template>
        <template #default="{ close }">
          <button type="button" class="bm-menu-item" :class="{ active: isActive('bulletList') }"
            @pointerdown.prevent="chain().toggleBulletList().run(); close()">
            Bullet list
          </button>
          <button type="button" class="bm-menu-item" :class="{ active: isActive('orderedList') }"
            @pointerdown.prevent="chain().toggleOrderedList().run(); close()">
            Numbered list
          </button>
          <button type="button" class="bm-menu-item" :class="{ active: isActive('taskList') }"
            @pointerdown.prevent="chain().toggleTaskList().run(); close()">
            Task list
          </button>
        </template>
      </BubbleMenuPopover>

      <!-- Alignment ------------------------------------------------ -->
      <BubbleMenuPopover label="Alignment">
        <template #trigger>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path :d="ALIGN_OPTIONS.find((a) => a.value === activeAlignValue())?.path ?? ALIGN_OPTIONS[0].path"
              fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
        </template>
        <template #default="{ close }">
          <button v-for="a in ALIGN_OPTIONS" :key="a.value" type="button" class="bm-menu-item"
            :class="{ active: isAttrActive({ textAlign: a.value }) }"
            @pointerdown.prevent="setAlign(a.value); close()">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" class="bm-menu-item__icon">
              <path :d="a.path" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class="bm-menu-item__label">{{ a.label }}</span>
          </button>
        </template>
      </BubbleMenuPopover>

      <!-- Colour / highlight --------------------------------------- -->
      <BubbleMenuPopover label="Colour">
        <template #trigger>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path fill="currentColor"
              d="M5.25 3h2L11 12.5H9.4l-.85-2.25h-3.6L4.1 12.5H2.5zm.45 6.1h2.6l-1.3-3.45z" />
            <rect x="2" y="13.5" width="12" height="1.5" fill="currentColor" />
          </svg>
        </template>
        <template #default="{ close }">
          <div class="bm-menu-section">Text colour</div>
          <div class="bm-swatch-grid">
            <button v-for="c in TEXT_COLORS" :key="`t-${c.label}`" type="button" class="bm-swatch"
              :title="c.label" :aria-label="c.label" @pointerdown.prevent="setColor(c.value); close()">
              <span class="bm-swatch__chip" :class="{ 'is-default': c.value === null }"
                :style="c.value ? { background: c.value } : undefined" />
            </button>
          </div>
          <div class="bm-menu-divider" role="separator" />
          <div class="bm-menu-section">Highlight</div>
          <div class="bm-swatch-grid">
            <button v-for="h in HIGHLIGHTS" :key="`h-${h.label}`" type="button" class="bm-swatch"
              :title="h.label" :aria-label="h.label" @pointerdown.prevent="setHighlight(h.value); close()">
              <span class="bm-swatch__chip" :class="{ 'is-default': h.value === null }"
                :style="h.value ? { background: h.value } : undefined" />
            </button>
          </div>
        </template>
      </BubbleMenuPopover>

      <!-- More: scripts ------------------------------------------- -->
      <BubbleMenuPopover label="More">
        <template #trigger>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
            <circle cx="8" cy="8" r="1.2" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
          </svg>
        </template>
        <template #default="{ close }">
          <button type="button" class="bm-menu-item" :class="{ active: isActive('subscript') }"
            @pointerdown.prevent="chain().toggleSubscript().run(); close()">
            Subscript
          </button>
          <button type="button" class="bm-menu-item" :class="{ active: isActive('superscript') }"
            @pointerdown.prevent="chain().toggleSuperscript().run(); close()">
            Superscript
          </button>
          <div class="bm-menu-divider" role="separator" />
          <button type="button" class="bm-menu-item"
            @pointerdown.prevent="chain().unsetAllMarks().clearNodes().run(); close()">
            Clear formatting
          </button>
        </template>
      </BubbleMenuPopover>
    </div>
  </BubbleMenu>
</template>

