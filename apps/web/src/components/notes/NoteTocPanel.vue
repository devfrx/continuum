<script setup lang="ts">
/**
 * NoteTocPanel
 * ────────────────────────────────────────────────────────────────────
 * Side-mounted, collapsible table of contents for the currently
 * selected note. Bound to the `update:toc` event emitted by
 * `ContinuumEditor` (driven by the `@tiptap/extension-table-of-contents`
 * extension), so the list stays in sync without ever traversing the
 * document JSON ourselves.
 *
 * The panel hides automatically when the document carries no headings,
 * mirroring `NoteFootnotesPanel` so host views (`NotesView`) can mount
 * it unconditionally. Collapsed state is delegated to the host via
 * `v-model:collapsed` so it can be persisted in localStorage.
 *
 * Layout note: this component only owns its inner chrome — sticky
 * positioning and outer width are applied by the parent grid in
 * `NotesView` so the panel sits on the right of the document column
 * without needing to know its own pixel offsets.
 */
import { EditorTableOfContents, type TocAnchor } from '@continuum/editor';

defineProps<{
    /** Latest anchor list emitted by the editor (`update:toc`). */
    anchors: TocAnchor[];
    /** Persisted collapsed state (host-controlled via `v-model:collapsed`). */
    collapsed?: boolean;
}>();

const emit = defineEmits<{
    /**
     * User clicked a heading row. Receives the original `TocAnchor`
     * so the parent can call `editorRef.value.scrollToAnchor(anchor)`.
     */
    (e: 'navigate', anchor: TocAnchor): void;
    /** Sync collapsed state back to the host (`v-model:collapsed`). */
    (e: 'update:collapsed', value: boolean): void;
}>();

function onAnchorClick(anchor: TocAnchor): void {
    emit('navigate', anchor);
}

function onCollapseChange(value: boolean): void {
    emit('update:collapsed', value);
}
</script>

<template>
    <aside v-if="anchors.length" class="note-toc-panel" :class="{ 'is-collapsed': collapsed }">
        <EditorTableOfContents title="Outline" :anchors="anchors" :collapsed="collapsed" @anchor-click="onAnchorClick"
            @update:collapsed="onCollapseChange" />
    </aside>
</template>

<style scoped>
.note-toc-panel {
    position: sticky;
    top: var(--space-6);
    align-self: start;
    width: 100%;
    min-width: 0;
    max-height: calc(100vh - var(--space-6) * 2);
    overflow: auto;
    padding-left: var(--space-4);
    border-left: var(--border-width-1) solid color-mix(in srgb, var(--border) 70%, transparent);
    scrollbar-width: thin;
    transition:
        padding-left var(--duration-base) var(--ease-standard),
        border-color var(--duration-base) var(--ease-standard);
}

.note-toc-panel.is-collapsed {
    overflow: visible;
    padding-left: 0;
    border-left-color: transparent;
}

.note-toc-panel :deep(.continuum-toc) {
    background: transparent;
    border: none;
    padding: 0;
}

@media (max-width: 1100px) {
    .note-toc-panel {
        position: static;
        max-height: none;
        padding-left: 0;
        padding-bottom: var(--space-3);
        border-left: none;
        border-bottom: var(--border-width-1) solid color-mix(in srgb, var(--border) 70%, transparent);
    }
}
</style>

