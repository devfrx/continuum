<script setup lang="ts">
/**
 * NotesSidebar — left rail of the notes view.
 *
 * Layout shell composed of:
 *   • {@link FolderTree}                  — folder navigation deck
 *   • search input + mode toggle          — local command surface
 *   • {@link RecentNotesSection}          — recently opened pin list
 *   • {@link NotesSidebarSearchResults}   — semantic search results path
 *   • {@link NotesSidebarList}            — folder/filter list path
 *
 * The two list children are mutually exclusive (chosen by `searchMode`
 * + non-empty query). Each owns its own row rendering; this shell just
 * picks which one to mount and wires shared events back up to NotesView.
 */
import { computed, onMounted, watch } from 'vue';
import { UiButton, UiInput, UiSegmented, Icon } from '@/components/ui';
import { FolderTree } from '@/components/folders';
import RecentNotesSection from '@/components/notes/RecentNotesSection.vue';
import NotesSidebarList from '@/components/notes/NotesSidebarList.vue';
import NotesSidebarSearchResults from '@/components/notes/NotesSidebarSearchResults.vue';
import { useKinds } from '@/composables/useKinds';
import { useFolders } from '@/composables/useFolders';
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
const kindStore = useKinds();

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

const isSemanticActive = computed(
    () => props.searchMode === 'semantic' && props.searchQuery.trim().length > 0,
);

/** Live count for the list header. */
const visibleCount = computed<number>(() => {
    if (isSemanticActive.value) return props.semanticHits.length;
    const q = props.searchQuery.toLowerCase().trim();
    if (!q) return folderScopedNotes.value.length;
    return folderScopedNotes.value.filter(
        (n) => n.title.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q),
    ).length;
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

        <RecentNotesSection :notes="notes" :selected-id="selectedId" @select="(id: string) => emit('select', id)" />

        <section class="note-stream" aria-label="Notes">
            <div class="list-head">
                <div class="list-head__title">
                    <span class="list-head__label">{{ isSemanticActive ? 'Results' : 'Notes' }}</span>
                    <span class="list-head__count">{{ visibleCount }}</span>
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

            <NotesSidebarSearchResults v-if="isSemanticActive" :notes="notes" :selected-id="selectedId"
                :semantic-hits="semanticHits" :semantic-busy="semanticBusy"
                @select="(id: string) => emit('select', id)" />

            <NotesSidebarList v-else :notes="folderScopedNotes" :selected-id="selectedId"
                :selected-folder-id="selectedFolderId" :search-query="searchQuery"
                @select="(id: string) => emit('select', id)" @delete="(id: string) => emit('delete', id)" />
        </section>
    </aside>
</template>

<style scoped>
/**
 * Notes sidebar shell. Per-row styling lives in
 * `NotesSidebarList.vue` / `NotesSidebarSearchResults.vue`; this file
 * only owns the deck/command layout.
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

@keyframes ui-spin {
    to {
        transform: rotate(360deg);
    }
}

.spin {
    animation: ui-spin 0.9s linear infinite;
}
</style>
