<script setup lang="ts">
/**
 * RecentNotesSection — compact list of the most recently viewed notes,
 * surfaced in the notes sidebar. Persisted across app restarts via
 * `useRecentNotes`.
 *
 * Kept presentational: receives the resolved notes + selection state
 * via props and emits selection changes. Layout uses CSS variables
 * from the shared theme so it stays consistent with the rest of the
 * sidebar.
 */
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import { useRecentNotes } from '@/composables/useRecentNotes';
import { useKinds } from '@/composables/useKinds';
import { graphDisplayLabel } from '@/utils/graphLabels';
import { relativeTime } from '@/utils/time';
import type { Note } from '@continuum/shared';

const props = defineProps<{
    notes: Note[];
    selectedId: string | null;
    /** Maximum number of recents to surface. Defaults to 6 to stay compact. */
    limit?: number;
}>();

const emit = defineEmits<{
    (e: 'select', id: string): void;
}>();

const recents = useRecentNotes();
const kinds = useKinds();

const items = computed(() => recents.entriesWithNotes(props.notes, props.limit ?? 6));
</script>

<template>
    <section v-if="items.length > 0" class="recent" aria-label="Recent notes">
        <header class="recent__head">
            <span class="recent__label">Recent</span>
            <button type="button" class="recent__clear" title="Clear recent notes" aria-label="Clear recent notes"
                @click="recents.clear">
                <Icon name="close" :size="11" />
            </button>
        </header>
        <ul class="recent__list">
            <li v-for="{ entry, note } in items" :key="entry.id" class="recent__row"
                :class="{ active: entry.id === selectedId }" @click="emit('select', entry.id)">
                <span class="recent__icon" :style="{ color: kinds.colorOf(note.kind) }">
                    <Icon :name="kinds.iconOf(note.kind)" :size="13" />
                </span>
                <span class="recent__title">{{ graphDisplayLabel(note.title?.trim() || 'Untitled', 60) }}</span>
                <span class="recent__time" :title="new Date(entry.viewedAt).toLocaleString()">
                    {{ relativeTime(entry.viewedAt) }}
                </span>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.recent {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
}

.recent__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.recent__label {
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
}

.recent__clear {
    appearance: none;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-xs);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.recent__clear:hover {
    background: var(--bg-elev);
    color: var(--fg);
}

.recent__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.recent__row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
    padding: 4px var(--space-2);
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard);
    min-width: 0;
}

.recent__row:hover {
    background: var(--bg-elev);
}

.recent__row.active {
    background: var(--accent-soft);
}

.recent__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
}

.recent__title {
    font-size: var(--text-xs);
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
}

.recent__row.active .recent__title {
    color: var(--accent);
    font-weight: var(--font-weight-semibold);
}

.recent__time {
    font-size: var(--text-2xs);
    color: var(--fg-muted);
    flex: 0 0 auto;
}
</style>
