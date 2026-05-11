<script setup lang="ts">
/**
 * NotesSidebarSearchResults — semantic search results path.
 *
 * Renders the list of `AiSearchHit` rows (with score badges) that the
 * parent provides while semantic search is active. Bubbles selection
 * back via the `select` event.
 */
import { computed } from 'vue';
import { Icon, UiBadge } from '@/components/ui';
import { useKinds } from '@/composables/useKinds';
import { graphDisplayLabel } from '@/utils/graphLabels';
import type { AiSearchHit, Note } from '@continuum/shared';

const props = defineProps<{
    notes: Note[];
    selectedId: string | null;
    semanticHits: AiSearchHit[];
    semanticBusy: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', id: string): void;
}>();

const kindStore = useKinds();

const semanticResults = computed(() => {
    const byId = new Map(props.notes.map((n) => [n.id, n]));
    return props.semanticHits.map((h) => ({ hit: h, note: byId.get(h.id) ?? null }));
});

function cleanSnippet(s: string): string {
    return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function displayTitle(title: string | null | undefined): string {
    return graphDisplayLabel(title?.trim() || 'Untitled', 80);
}

function formatScore(score: number): string {
    const pct = score * 100;
    if (pct >= 10) return `${pct.toFixed(0)}%`;
    if (pct >= 1) return `${pct.toFixed(1)}%`;
    return `${pct.toFixed(2)}%`;
}

function onNoteDragStart(ev: DragEvent, id: string): void {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/x-continuum-note-id', id);
}

defineExpose({ count: computed(() => semanticResults.value.length) });
</script>

<template>
    <ul class="note-list" :class="{ refreshing: semanticBusy && semanticResults.length }">
        <li v-for="r in semanticResults" :key="r.hit.id" class="note-row" :class="{ active: r.hit.id === selectedId }"
            draggable="true" @dragstart="onNoteDragStart($event, r.hit.id)" @click="emit('select', r.hit.id)">
            <span class="kind-mark">
                <Icon :name="kindStore.iconOf(r.note?.kind ?? 'note')" :size="14" class="kind-icon" />
                <span class="dot" :style="{ background: kindStore.colorOf(r.note?.kind ?? 'note') }" />
            </span>
            <div class="meta">
                <div class="title">{{ displayTitle(r.hit.title || r.note?.title) }}</div>
                <div class="snippet">{{ cleanSnippet(r.hit.snippet) }}</div>
            </div>
            <UiBadge>{{ formatScore(r.hit.score) }}</UiBadge>
        </li>
        <li v-if="semanticBusy && !semanticResults.length" class="empty searching">
            <Icon name="spinner" :size="14" class="spin" />
            <span>Searching…</span>
        </li>
        <li v-else-if="!semanticBusy && !semanticResults.length" class="empty">
            No semantic matches.
        </li>
    </ul>
</template>

<style scoped>
.note-list {
    list-style: none;
    padding: var(--space-px) 0 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
}

.note-row {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--fg);
    position: relative;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.note-row:hover {
    background: var(--bg-soft);
    border-color: var(--border);
}

.note-row.active {
    background: var(--bg-elev);
    border-color: var(--border-strong);
    color: var(--fg-strong);
}

.kind-mark {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, currentColor 10%, transparent);
    flex-shrink: 0;
    margin-top: 1px;
    border: var(--border-width-1) solid color-mix(in srgb, currentColor 24%, transparent);
}

.kind-icon {
    color: inherit;
    flex-shrink: 0;
}

.meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.title {
    color: var(--fg);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.snippet {
    color: var(--fg-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
}

.empty {
    display: flex;
    align-items: center;
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    cursor: default;
    justify-content: center;
    padding: var(--space-7) var(--space-4);
    text-align: center;
}

.empty.searching {
    gap: var(--space-4);
}

.note-list.refreshing {
    opacity: 0.62;
    transition: opacity var(--duration-fast) var(--ease-standard);
}

@keyframes ui-spin {
    to {
        transform: rotate(360deg);
    }
}

.spin {
    animation: ui-spin 0.9s linear infinite;
}
</style>
