<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { UiButton, UiInput, UiSegmented, UiBadge, Icon } from '@/components/ui';
import { FolderTree } from '@/components/folders';
import { useKinds } from '@/composables/useKinds';
import { useFolders } from '@/composables/useFolders';
import { graphDisplayLabel } from '@/utils/graphLabels';
import type { AiSearchHit, FolderNode, Note } from '@continuum/shared';

type SearchMode = 'filter' | 'semantic';

const props = defineProps<{
    notes: Note[];
    selectedId: string | null;
    /** Currently scoped folder; `null` = "All notes / root". */
    selectedFolderId: string | null;
    searchQuery: string;
    searchMode: SearchMode;
    semanticHits: AiSearchHit[];
    semanticBusy: boolean;
    /** False when no provider has an embedding model loaded. */
    semanticAvailable: boolean;
    /** Enables local-only development utilities such as test corpus seeding. */
    devMode?: boolean;
    seedBusy?: boolean;
    seedError?: string;
}>();

const emit = defineEmits<{
    (e: 'update:searchQuery', value: string): void;
    (e: 'update:searchMode', value: SearchMode): void;
    (e: 'update:selectedFolderId', value: string | null): void;
    (e: 'select', id: string): void;
    (e: 'create'): void;
    (e: 'seed-test-notes'): void;
    (e: 'delete', id: string): void;
    (e: 'runSemantic'): void;
    (e: 'create-folder', parentId: string | null): void;
    (e: 'edit-folder', folder: FolderNode): void;
    (e: 'delete-folder', folder: FolderNode): void;
    (e: 'move-note', payload: { noteId: string; folderId: string | null }): void;
}>();

const folders = useFolders();

/**
 * Notes filtered by the current folder scope. When `selectedFolderId` is
 * non-null we include the folder itself plus all its descendants (matches
 * the server's default `recursive=true` for semantic search).
 */
const folderScopedNotes = computed<Note[]>(() => {
    if (!props.selectedFolderId) return props.notes;
    const root = folders.byId(props.selectedFolderId);
    if (!root) return props.notes;
    const allowed = new Set<string>();
    const walk = (n: FolderNode): void => {
        allowed.add(n.id);
        for (const c of n.children) walk(c);
    };
    walk(root);
    return props.notes.filter((n) => n.folderId && allowed.has(n.folderId));
});

const filtered = computed<Note[]>(() => {
    if (props.searchMode === 'semantic') return folderScopedNotes.value;
    const q = props.searchQuery.toLowerCase().trim();
    if (!q) return folderScopedNotes.value;
    return folderScopedNotes.value.filter(
        (n) => n.title.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q),
    );
});

const semanticResults = computed(() => {
    if (props.searchMode !== 'semantic') return [];
    const byId = new Map(props.notes.map((n) => [n.id, n]));
    return props.semanticHits.map((h) => ({ hit: h, note: byId.get(h.id) ?? null }));
});

/** Count of notes living at root (no folder) for the "All notes" row. */
const rootNoteCount = computed(() => props.notes.filter((n) => !n.folderId).length);

/** Name of the currently scoped folder (for the "in: …" chip). */
const scopeFolderName = computed<string>(() =>
    props.selectedFolderId ? folders.byId(props.selectedFolderId)?.name ?? '?' : '',
);

const modeOptions = computed(() => {
    const opts: { value: string; label: string }[] = [{ value: 'filter', label: 'Filter' }];
    if (props.semanticAvailable) opts.push({ value: 'semantic', label: 'Semantic' });
    return opts;
});

// Force search mode back to 'filter' if semantic disappears while selected.
watch(
    () => props.semanticAvailable,
    (available) => {
        if (!available && props.searchMode === 'semantic') emit('update:searchMode', 'filter');
    },
);

function onSearchInput(v: string): void { emit('update:searchQuery', v); }
function onModeChange(v: string): void { emit('update:searchMode', v as SearchMode); }
function onEnter(): void { if (props.searchMode === 'semantic') emit('runSemantic'); }
function onDelete(id: string, ev: Event): void {
    ev.stopPropagation();
    emit('delete', id);
}

/**
 * Drag handler attached to every note row so users can drag a note onto a
 * folder in the tree to move it. The payload uses a custom mime type to
 * avoid colliding with browser-native drags (text, urls, files).
 */
function onNoteDragStart(ev: DragEvent, id: string): void {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/x-continuum-note-id', id);
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

function displayTitle(title: string | null | undefined): string {
    return graphDisplayLabel(title?.trim() || 'Untitled', 80);
}

const kindStore = useKinds();
onMounted(() => {
    void kindStore.load();
    void folders.load();
});
</script>

<template>
    <aside class="sidebar">
        <section class="nav-deck" aria-label="Folder navigation">
            <FolderTree class="folder-navigator" :selected-folder-id="selectedFolderId" :root-note-count="rootNoteCount"
                @update:selected-folder-id="(v) => emit('update:selectedFolderId', v)"
                @create-folder="(parentId) => emit('create-folder', parentId)"
                @edit-folder="(f) => emit('edit-folder', f)" @delete-folder="(f) => emit('delete-folder', f)"
                @drop-note="(p) => emit('move-note', p)" />
        </section>

        <section class="command-deck" aria-label="Note commands">
            <UiInput :model-value="searchQuery" placeholder="Search notes…" size="sm" left-icon class="note-search"
                @update:model-value="onSearchInput" @keydown.enter.prevent="onEnter">
                <template #icon>
                    <Icon name="search" :size="13" />
                </template>
                <template v-if="searchMode === 'semantic' && semanticBusy" #trailing>
                    <Icon name="spinner" :size="13" class="spin" />
                </template>
            </UiInput>

            <div class="mode-row">
                <UiSegmented :model-value="searchMode" :options="modeOptions" size="sm" aria-label="Search mode"
                    class="mode-switch" @update:model-value="onModeChange" />
            </div>

            <div v-if="selectedFolderId" class="scope-chip"
                :title="`Searching in '${scopeFolderName}' and its subfolders`">
                <Icon name="folder" :size="12" />
                <span class="scope-chip__name">{{ scopeFolderName }}</span>
                <button type="button" class="scope-chip__clear" aria-label="Clear folder scope"
                    @click="emit('update:selectedFolderId', null)">
                    <Icon name="close" :size="11" />
                </button>
            </div>
        </section>

        <section class="note-stream" aria-label="Notes">
            <div class="list-head">
                <div class="list-head__title">
                    <span class="list-head__label">{{ searchMode === 'semantic' && searchQuery.trim() ? 'Results' :
                        'Notes'
                        }}</span>
                    <span class="list-head__count">{{ searchMode === 'semantic' && searchQuery.trim() ?
                        semanticResults.length :
                        filtered.length }}</span>
                </div>
                <div class="list-actions">
                    <UiButton v-if="devMode" variant="subtle" size="sm" class="seed-notes" :loading="seedBusy"
                        :disabled="seedBusy" title="Generate semantic search test notes"
                        @click="emit('seed-test-notes')">
                        <template #icon-left>
                            <Icon name="sparkles" :size="12" />
                        </template>
                        Seed
                    </UiButton>
                    <UiButton variant="primary" size="sm" class="new-note" @click="emit('create')">
                        <template #icon-left>
                            <Icon name="plus" :size="12" />
                        </template>
                        New
                    </UiButton>
                </div>
            </div>

            <p v-if="devMode && seedError" class="seed-error">{{ seedError }}</p>

            <ul v-if="searchMode === 'semantic' && searchQuery.trim()" class="note-list"
                :class="{ refreshing: semanticBusy && semanticResults.length }">
                <li v-for="r in semanticResults" :key="r.hit.id" class="note-row"
                    :class="{ active: r.hit.id === selectedId }" draggable="true"
                    @dragstart="onNoteDragStart($event, r.hit.id)" @click="emit('select', r.hit.id)">
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

            <ul v-else class="note-list">
                <li v-for="n in filtered" :key="n.id" class="note-row" :class="{ active: n.id === selectedId }"
                    draggable="true" @dragstart="onNoteDragStart($event, n.id)" @click="emit('select', n.id)">
                    <span class="kind-mark">
                        <Icon :name="kindStore.iconOf(n.kind)" :size="14" class="kind-icon" />
                        <span class="dot" :style="{ background: kindStore.colorOf(n.kind) }" />
                    </span>
                    <div class="meta">
                        <div class="title">{{ displayTitle(n.title) }}</div>
                        <div class="kind-label">{{ n.kind }}</div>
                    </div>
                    <button class="del" title="Delete note" aria-label="Delete note" @click="onDelete(n.id, $event)">
                        <Icon name="close" :size="14" />
                    </button>
                </li>
                <li v-if="!notes.length" class="empty">No notes yet — create one.</li>
                <li v-else-if="!filtered.length" class="empty">No matches.</li>
            </ul>
        </section>
    </aside>
</template>

<style scoped>
/**
 * Notes sidebar redesign.
 *
 * The sidebar is now a compact instrument panel: folder navigation is a
 * bounded deck, search/new/mode are one command surface, and the notes
 * list is the only large scroll region. This fixes the previous visual
 * stack of oversized blocks and prevents the folder tree from being
 * squeezed until rows clip at the top.
 */
.sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    height: 100%;
    min-height: 0;
}

.nav-deck {
    flex: 0 0 118px;
    min-height: 104px;
    max-height: 24%;
    overflow: hidden;
}

.folder-navigator {
    height: 100%;
}

.nav-deck :deep(.folder-tree) {
    height: 100%;
}

.nav-deck :deep(.tree) {
    padding-right: var(--space-1);
}

.command-deck {
    display: grid;
    gap: var(--space-2);
    padding: 0 var(--space-1);
    flex: 0 0 auto;
}

.note-search.note-search {
    min-width: 0;
    background: var(--bg-elev);
    border-color: var(--border);
}

.note-search.note-search:hover,
.note-search.note-search:focus-within {
    border-color: var(--border-strong);
    background: var(--bg-elev);
}

.note-search :deep(input) {
    font-size: var(--text-sm);
}

.mode-row {
    display: flex;
    min-width: 0;
}

.mode-switch {
    width: 100%;
    --ui-seg-h: 28px;
}

.mode-switch :deep(.ui-seg__btn) {
    flex: 1;
    min-width: 0;
    padding: 0;
}

.scope-chip {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: var(--space-2);
    max-width: 100%;
    height: 24px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--fg);
    font-size: var(--text-xs);
    line-height: 1;
}

.scope-chip__name {
    max-width: 154px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-strong);
    font-weight: var(--font-weight-medium);
}

.scope-chip__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-circle);
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
}

.scope-chip__clear:hover {
    background: var(--bg-soft);
    color: var(--fg-strong);
}

.note-stream {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0 var(--space-1) 0 var(--space-2);
    min-height: 30px;
}

.list-head__title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.list-head__label {
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
}

.list-head__count {
    min-width: 24px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    background: var(--bg-soft);
    color: var(--fg-muted);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
}

.list-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;
}

.seed-notes.seed-notes,
.new-note.new-note {
    min-height: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
}

.seed-error {
    margin: 0 var(--space-1);
    padding: 0 var(--space-2);
    color: var(--danger);
    font-size: var(--text-xs);
    line-height: 1.35;
}

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
    grid-template-columns: 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 46px;
    padding: var(--space-2);
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--fg);
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
    background: var(--bg-elevated);
    border-color: var(--border-strong);
    color: var(--fg-strong);
}

.note-row.active .title {
    color: var(--fg-strong);
}

.kind-mark {
    width: 26px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    flex-shrink: 0;
}

.note-row:hover .kind-mark,
.note-row.active .kind-mark {
    background: var(--bg-elev);
    border-color: var(--border-strong);
}

.dot {
    position: absolute;
    right: 5px;
    bottom: 5px;
    width: 6px;
    height: 6px;
    border-radius: var(--radius-circle);
    box-shadow: 0 0 0 2px var(--bg-soft);
}

.kind-icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-0-5);
    min-width: 0;
}

.title {
    color: var(--fg);
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.kind-label,
.snippet {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.kind-label {
    text-transform: capitalize;
}

.snippet {
    color: var(--fg-muted);
}

.del {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-xs);
    opacity: 0;
    cursor: pointer;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.note-row:hover .del,
.note-row.active .del {
    opacity: 1;
}

.del:hover {
    background: var(--danger-soft);
    color: var(--danger);
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

.empty:hover {
    background: transparent;
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
