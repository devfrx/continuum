<script setup lang="ts">
/**
 * NoteFootnotesPanel
 * ────────────────────────────────────────────────────────────────────
 * Renders the auto-numbered footnotes attached to a note. The list is
 * derived purely from the editor's JSON document via `extractFootnotes`
 * exported by `@continuum/editor`, so the panel stays in sync with the
 * editor without requiring its own state.
 *
 * The panel is intentionally invisible when the document carries no
 * footnotes — host views (e.g. `NotesView`) can mount it unconditionally.
 */
import { computed } from 'vue';
import { extractFootnotes, type ExtractedFootnote } from '@continuum/editor';

const props = defineProps<{
    /** Tiptap document JSON for the currently selected note. */
    contentJson: unknown;
}>();

const items = computed<ExtractedFootnote[]>(() => extractFootnotes(props.contentJson));
</script>

<template>
    <section v-if="items.length" class="footnotes-panel" aria-label="Footnotes">
        <header class="footnotes-panel__head">
            <span class="footnotes-panel__title">Footnotes</span>
            <span class="footnotes-panel__count">{{ items.length }}</span>
        </header>
        <ol class="footnotes-panel__list">
            <li v-for="fn in items" :key="fn.index" class="footnotes-panel__item">
                <span class="footnotes-panel__num">[{{ fn.index }}]</span>
                <span class="footnotes-panel__body" :class="{ 'is-empty': !fn.content }">
                    {{ fn.content || '—' }}
                </span>
            </li>
        </ol>
    </section>
</template>

<style scoped>
.footnotes-panel {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
}

.footnotes-panel__head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
}

.footnotes-panel__title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--fg-strong);
}

.footnotes-panel__count {
    font-size: var(--text-xs);
    color: var(--fg-muted);
}

.footnotes-panel__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.footnotes-panel__item {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    color: var(--fg);
}

.footnotes-panel__num {
    flex: 0 0 auto;
    color: var(--accent);
    font-weight: var(--font-weight-semibold);
    font-variant-numeric: tabular-nums;
}

.footnotes-panel__body {
    flex: 1 1 auto;
    white-space: pre-wrap;
    word-break: break-word;
}

.footnotes-panel__body.is-empty {
    color: var(--fg-muted);
    font-style: italic;
}
</style>
