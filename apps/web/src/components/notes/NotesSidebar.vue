<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { UiButton, UiInput, UiSegmented, UiBadge, Icon } from '@/components/ui';
import { useKinds } from '@/composables/useKinds';
import type { AiSearchHit, Note } from '@continuum/shared';

type SearchMode = 'filter' | 'semantic';

const props = defineProps<{
    notes: Note[];
    selectedId: string | null;
    searchQuery: string;
    searchMode: SearchMode;
    semanticHits: AiSearchHit[];
    semanticBusy: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:searchQuery', value: string): void;
    (e: 'update:searchMode', value: SearchMode): void;
    (e: 'select', id: string): void;
    (e: 'create'): void;
    (e: 'delete', id: string): void;
    (e: 'runSemantic'): void;
}>();

const filtered = computed<Note[]>(() => {
    if (props.searchMode === 'semantic') return props.notes;
    const q = props.searchQuery.toLowerCase().trim();
    if (!q) return props.notes;
    return props.notes.filter(
        (n) => n.title.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q),
    );
});

const semanticResults = computed(() => {
    if (props.searchMode !== 'semantic') return [];
    const byId = new Map(props.notes.map((n) => [n.id, n]));
    return props.semanticHits.map((h) => ({ hit: h, note: byId.get(h.id) ?? null }));
});

const modeOptions = [
    { value: 'filter', label: 'Filter' },
    { value: 'semantic', label: 'Semantic' },
];

function onSearchInput(v: string): void { emit('update:searchQuery', v); }
function onModeChange(v: string): void { emit('update:searchMode', v as SearchMode); }
function onEnter(): void { if (props.searchMode === 'semantic') emit('runSemantic'); }
function onDelete(id: string, ev: Event): void {
    ev.stopPropagation();
    emit('delete', id);
}

/** Strip HTML tags for the snippet preview so the sidebar shows readable text
 *  instead of `<p><strong>...</strong></p>` markup. */
function cleanSnippet(s: string): string {
    return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Display similarity as percentage with adaptive precision so small but
 *  non-zero scores (typical for short queries against long docs) don't
 *  collapse to "0%". */
function formatScore(score: number): string {
    const pct = score * 100;
    if (pct >= 10) return `${pct.toFixed(0)}%`;
    if (pct >= 1) return `${pct.toFixed(1)}%`;
    return `${pct.toFixed(2)}%`;
}

const kindStore = useKinds();
onMounted(() => { void kindStore.load(); });
</script>

<template>
    <aside class="sidebar">
        <div class="search-row">
            <UiInput :model-value="searchQuery" placeholder="Search notes…" left-icon class="search-input"
                @update:model-value="onSearchInput" @keydown.enter.prevent="onEnter">
                <template #icon>
                    <Icon name="search" :size="14" />
                </template>
                <template v-if="searchMode === 'semantic' && semanticBusy" #trailing>
                    <Icon name="lucide:loader-2" :size="14" class="spin" />
                </template>
            </UiInput>

            <UiSegmented :model-value="searchMode" :options="modeOptions" aria-label="Search mode"
                @update:model-value="onModeChange" />
        </div>

        <UiButton variant="primary" class="new-note" @click="emit('create')">
            <template #icon-left>
                <Icon name="plus" :size="14" />
            </template>
            New note
        </UiButton>

        <div class="list-head">
            <span class="list-head__label">{{ searchMode === 'semantic' && searchQuery.trim() ? 'Results' : 'All notes'
                }}</span>
            <span class="list-head__count">{{ searchMode === 'semantic' && searchQuery.trim() ? semanticResults.length :
                filtered.length }}</span>
        </div>

        <ul v-if="searchMode === 'semantic' && searchQuery.trim()" class="note-list"
            :class="{ refreshing: semanticBusy && semanticResults.length }">
            <li v-for="r in semanticResults" :key="r.hit.id" :class="{ active: r.hit.id === selectedId }"
                @click="emit('select', r.hit.id)">
                <span class="dot" :style="{ background: kindStore.colorOf(r.note?.kind ?? 'note') }" />
                <Icon :name="kindStore.iconOf(r.note?.kind ?? 'note')" :size="14" class="kind-icon" />
                <div class="meta">
                    <div class="title">{{ r.hit.title || r.note?.title || 'Untitled' }}</div>
                    <div class="snippet">{{ cleanSnippet(r.hit.snippet) }}</div>
                </div>
                <UiBadge>{{ formatScore(r.hit.score) }}</UiBadge>
            </li>
            <li v-if="semanticBusy && !semanticResults.length" class="empty searching">
                <Icon name="lucide:loader-2" :size="14" class="spin" />
                <span>Searching…</span>
            </li>
            <li v-else-if="!semanticBusy && !semanticResults.length" class="empty">
                No semantic matches.
            </li>
        </ul>

        <ul v-else class="note-list">
            <li v-for="n in filtered" :key="n.id" :class="{ active: n.id === selectedId }"
                @click="emit('select', n.id)">
                <span class="dot" :style="{ background: kindStore.colorOf(n.kind) }" />
                <Icon :name="kindStore.iconOf(n.kind)" :size="14" class="kind-icon" />
                <div class="meta">
                    <div class="title">{{ n.title || 'Untitled' }}</div>
                    <div class="kind-label">{{ n.kind }}</div>
                </div>
                <button class="del" title="Delete note" aria-label="Delete note" @click="onDelete(n.id, $event)">
                    <Icon name="close" :size="14" />
                </button>
            </li>
            <li v-if="!notes.length" class="empty">No notes yet — create one.</li>
            <li v-else-if="!filtered.length" class="empty">No matches.</li>
        </ul>
    </aside>
</template>

<style scoped>
.sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    height: 100%;
    min-height: 0;
}

.search-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.new-note {
    width: 100%;
}

.list-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
    font-weight: var(--font-weight-semibold);
}

.list-head__count {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    color: var(--fg-muted);
    font-weight: var(--font-weight-regular);
    text-transform: none;
}

.note-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow: auto;
    min-height: 0;
}

.note-list li {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
    position: relative;
}

.note-list li:hover {
    background: var(--bg-soft);
}

.note-list li.active {
    background: var(--accent-soft);
    color: var(--fg-strong);
}

.note-list li.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: var(--radius-xs);
    background: var(--accent);
}

.note-list li.active .title {
    color: var(--fg-strong);
}

.note-list li.empty {
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    cursor: default;
    justify-content: center;
    padding: var(--space-7) var(--space-4);
}

.note-list li.empty:hover {
    background: transparent;
}

.note-list li.empty.searching {
    gap: var(--space-4);
}

/* Subtle dimming while a refined query is in flight. */
.note-list.refreshing {
    opacity: 0.6;
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

.dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-circle);
    flex-shrink: 0;
    display: inline-block;
}

.kind-icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.meta {
    flex: 1;
    min-width: 0;
}

.title {
    font-size: var(--text-base);
    font-weight: var(--font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
}

.kind-label {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    text-transform: capitalize;
}

.snippet {
    font-size: var(--text-xs);
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.del {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    opacity: 0;
    cursor: pointer;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.note-list li:hover .del {
    opacity: 1;
}

.del:hover {
    background: var(--danger-soft);
    color: var(--danger);
}
</style>
