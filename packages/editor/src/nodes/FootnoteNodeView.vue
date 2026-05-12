<script setup lang="ts">
/**
 * Vue NodeView for the Footnote inline atom.
 *
 * Displays a clickable superscript marker `[n]` (auto-numbered by walking
 * the live document) and opens an inline popover for editing the
 * footnote body. The popover contains a single textarea — footnotes are
 * intentionally plain-text in v1 to keep the inline marker, the popover
 * preview, and the bottom-of-page summary panel in lockstep.
 *
 * The number rendered next to the marker is computed from the document,
 * not from the node attributes, so renumbering is automatic when
 * footnotes are inserted, deleted, or reordered.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { FOOTNOTE_NODE_NAME } from './Footnote';

const props = defineProps(nodeViewProps);

const open = ref(false);
const draft = ref('');
const root = ref<HTMLElement | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null);

/**
 * 1-based position of this node among all `footnote` nodes in the doc.
 * Computed live so insertions/deletions renumber every marker without
 * manual bookkeeping. Falls back to `?` if `getPos()` is unavailable
 * (it can briefly be during a destructive transaction).
 */
const number = computed<string>(() => {
    const pos = typeof props.getPos === 'function' ? props.getPos() : null;
    if (pos === null || pos === undefined) return '?';
    let count = 0;
    let result = 0;
    props.editor.state.doc.descendants((node, p) => {
        if (node.type.name !== FOOTNOTE_NODE_NAME) return true;
        count += 1;
        if (p === pos) result = count;
        return false; // atoms have no relevant descendants
    });
    return String(result || count);
});

const previewBody = computed<string>(() => {
    const raw = String(props.node.attrs.content ?? '').trim();
    if (!raw) return 'Empty footnote — click to add a note';
    return raw.length > 200 ? `${raw.slice(0, 200).trimEnd()}…` : raw;
});

const isEditable = computed<boolean>(() => props.editor.isEditable);

function togglePopover(): void {
    if (open.value) {
        commitDraft();
        open.value = false;
        return;
    }
    draft.value = String(props.node.attrs.content ?? '');
    open.value = true;
    // Focus on next tick once the textarea is mounted.
    requestAnimationFrame(() => textarea.value?.focus());
}

function commitDraft(): void {
    const next = draft.value;
    if (next === props.node.attrs.content) return;
    props.updateAttributes({ content: next });
}

function onKey(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
        ev.preventDefault();
        open.value = false;
        return;
    }
    // Ctrl/Cmd+Enter — confirm & close (matches the rest of the app's
    // popover affordances).
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        commitDraft();
        open.value = false;
    }
}

function onDocClick(ev: MouseEvent): void {
    if (!open.value) return;
    if (root.value && !root.value.contains(ev.target as Node)) {
        commitDraft();
        open.value = false;
    }
}

onMounted(() => document.addEventListener('mousedown', onDocClick));
onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick);
    if (open.value) commitDraft();
});
</script>

<template>
    <NodeViewWrapper as="span" class="continuum-footnote-wrap" data-type="footnote">
        <span ref="root" class="continuum-footnote-host" contenteditable="false">
            <button type="button" class="continuum-footnote" :class="{ 'is-empty': !node.attrs.content }"
                :title="previewBody" :aria-label="`Footnote ${number}`" :aria-expanded="open"
                @click.stop="togglePopover">
                <sup>[{{ number }}]</sup>
            </button>

            <div v-if="open" class="continuum-footnote__popover" role="dialog"
                :aria-label="`Footnote ${number} editor`">
                <header class="continuum-footnote__popover-head">
                    <span class="continuum-footnote__popover-title">Footnote {{ number }}</span>
                    <span class="continuum-footnote__popover-hint">Esc to close · Ctrl+Enter to save</span>
                </header>
                <textarea ref="textarea" v-model="draft" class="continuum-footnote__textarea"
                    placeholder="Write the footnote body…" :readonly="!isEditable" rows="4" @keydown="onKey" />
            </div>
        </span>
    </NodeViewWrapper>
</template>

<style>
/* Footnote NodeView styling lives in `styles/nodes.css` so it ships with
   the rest of the NodeView chrome and remains style-isolated from the
   host application's scoped CSS. */
</style>
