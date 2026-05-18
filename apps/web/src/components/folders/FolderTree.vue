<script setup lang="ts">
/**
 * FolderTree — sidebar tree view of the folder forest.
 *
 * Pure presentation: it reads the cached forest from `useFolders`, renders
 * a special "All notes" / root row, and delegates each branch to
 * `FolderTreeNode`. Selection is owned by the parent (NotesView) via the
 * `selectedFolderId` prop + `update:selectedFolderId` event so the tree
 * stays in sync with the URL query (`?folder=…`).
 */
import { computed, onMounted } from 'vue';
import { Icon } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import FolderTreeNoteRow from './FolderTreeNoteRow.vue';
import FolderTreeNode from './FolderTreeNode.vue';
import type { FolderNode, Note } from '@continuum/shared';

const props = defineProps<{
    /** Currently selected folder id; `null` = "All / root". */
    selectedFolderId: string | null;
    /** Total number shown in the root scope row. */
    rootNoteCount?: number;
    /** Optional notes catalogue used to render notes inline under folders. */
    notes?: Note[];
    /** Currently open note id (highlighted in nested rows). */
    selectedNoteId?: string | null;
    /** Lower-cased filter substring; empty disables note filtering. */
    noteSearch?: string;
}>();

const emit = defineEmits<{
    (e: 'update:selectedFolderId', value: string | null): void;
    (e: 'select-note', id: string): void;
    (e: 'delete-note', id: string): void;
    (e: 'create-folder', parentId: string | null): void;
    (e: 'edit-folder', folder: FolderNode): void;
    (e: 'delete-folder', folder: FolderNode): void;
    (e: 'drop-note', payload: { noteId: string; folderId: string | null }): void;
}>();

const folders = useFolders();
onMounted(() => { void folders.load(); });

/** Notes grouped by `folderId` (key `null` = root-level). O(1) lookup. */
const notesByFolder = computed<Map<string | null, Note[]>>(() => {
    const map = new Map<string | null, Note[]>();
    for (const n of props.notes ?? []) {
        const key = n.folderId ?? null;
        const bucket = map.get(key);
        if (bucket) bucket.push(n);
        else map.set(key, [n]);
    }
    return map;
});

/** Lower-cased query for case-insensitive substring matches. */
const queryLower = computed<string>(() => (props.noteSearch ?? '').toLowerCase().trim());

/** Predicate used by every nested note row. */
function noteMatches(n: Note): boolean {
    if (!queryLower.value) return true;
    return n.title.toLowerCase().includes(queryLower.value)
        || n.kind.toLowerCase().includes(queryLower.value);
}
const noteFilter = computed<((n: Note) => boolean) | null>(
    () => (queryLower.value ? noteMatches : null),
);

/**
 * Folder ids that contain at least one matching note in their subtree.
 * Used to auto-expand only the relevant branches without disturbing the
 * collapsed state of unrelated folders.
 */
const expandedFolderSet = computed<Set<string>>(() => {
    const result = new Set<string>();
    if (!queryLower.value) return result;
    for (const n of props.notes ?? []) {
        if (!n.folderId) continue;
        if (!noteMatches(n)) continue;
        let cur: FolderNode | null = folders.byId(n.folderId);
        while (cur) {
            result.add(cur.id);
            cur = cur.parentId ? folders.byId(cur.parentId) : null;
        }
    }
    return result;
});

/** Root-less notes (no folder), already filtered by the active query. */
const rootNotes = computed<Note[]>(() => {
    const all = notesByFolder.value.get(null) ?? [];
    return queryLower.value ? all.filter(noteMatches) : all;
});
const rootDisplayCount = computed(() => props.rootNoteCount ?? props.notes?.length ?? 0);

function selectRoot(): void { emit('update:selectedFolderId', null); }

/** Root drop-target: dragging a note onto the "All" row sends it back to root. */
function onRootDrop(ev: DragEvent): void {
    ev.preventDefault();
    const noteId = ev.dataTransfer?.getData('application/x-continuum-note-id');
    if (noteId) emit('drop-note', { noteId, folderId: null });
}

</script>

<template>
    <div class="folder-tree">
        <div class="tree-head">
            <span class="tree-head__label">Folders</span>
            <button type="button" class="tree-head__add" title="New folder at root" aria-label="New folder at root"
                @click="emit('create-folder', null)">
                <Icon name="plus" :size="12" />
            </button>
        </div>

        <ul class="tree" role="tree">
            <li class="root-branch" role="treeitem" :aria-selected="selectedFolderId === null" aria-expanded="true">
                <div :class="['tree-row', 'root-row', { active: selectedFolderId === null }]" @click="selectRoot"
                    @dragover.prevent @drop="onRootDrop">
                    <Icon name="inbox" :size="14" class="folder-icon" />
                    <span class="name">All notes</span>
                    <span v-if="rootDisplayCount" class="count">{{ rootDisplayCount }}</span>
                </div>

                <ul class="root-children" role="group">
                    <FolderTreeNode v-for="node in folders.tree.value" :key="node.id" :node="node" :depth="1"
                        :selected-id="selectedFolderId" :notes-by-folder="notesByFolder"
                        :selected-note-id="selectedNoteId" :expanded-folder-set="expandedFolderSet"
                        :note-filter="noteFilter" @select="(id) => emit('update:selectedFolderId', id)"
                        @select-note="(id) => emit('select-note', id)"
                        @delete-note="(id) => emit('delete-note', id)"
                        @create-folder="(parentId) => emit('create-folder', parentId)"
                        @edit-folder="(f) => emit('edit-folder', f)" @delete-folder="(f) => emit('delete-folder', f)"
                        @drop-note="(payload) => emit('drop-note', payload)" />

                    <FolderTreeNoteRow v-for="n in rootNotes" :key="`note-${n.id}`" :note="n" :depth="1"
                        :selected="n.id === selectedNoteId" @select="(id) => emit('select-note', id)"
                        @delete="(id) => emit('delete-note', id)" />

                    <li v-if="!folders.loading.value && folders.tree.value.length === 0 && rootNotes.length === 0"
                        class="empty">
                        <span class="empty__hint">No notes yet.</span>
                        <button type="button" class="empty__link" @click="emit('create-folder', null)">
                            Create a folder
                        </button>
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<style scoped>
/**
 * Sidebar folder tree.
 *
 * Visual model: rows mirror the note-list rows below — same height, same
 * hover (`--bg-soft`), same active treatment (`--accent-soft` bg with
 * stronger text). This keeps the whole sidebar reading as a single
 * coherent column instead of two competing list styles.
 *
 * The container has no outer chrome (border/separator) because
 * `NotesSidebar` already gaps every section with `--space-5`; adding more
 * dividers there made the panel feel cluttered.
 */
.folder-tree {
    --tree-indent: 18px;
    --tree-gutter: var(--space-3);
    --tree-guide-color: color-mix(in srgb, var(--fg-muted) 20%, transparent);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    height: 100%;
    min-height: 0;
}

.tree-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    padding: 0 var(--space-2);
    margin-bottom: var(--space-1);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    flex: 0 0 auto;
}

.tree-head__add {
    appearance: none;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    border-radius: var(--radius-xs);
    transition: background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.tree-head__add:hover {
    background: var(--bg-soft);
    color: var(--fg-strong);
}

.tree {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1 1 auto;
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-right: var(--space-1);
}

.root-branch {
    list-style: none;
    min-width: 0;
}

.root-children {
    list-style: none;
    margin: var(--space-1) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
}

.root-children::before {
    content: '';
    position: absolute;
    left: calc(var(--tree-gutter) + 7px);
    top: 2px;
    bottom: 4px;
    width: var(--border-width-1);
    border-radius: var(--radius-pill);
    background: var(--tree-guide-color);
    pointer-events: none;
}

.tree-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 32px;
    padding: 0 var(--space-2);
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--fg);
    user-select: none;
    transition: background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.tree-row:hover {
    background: color-mix(in srgb, var(--bg-soft) 82%, transparent);
    border-color: color-mix(in srgb, var(--border) 72%, transparent);
}

.tree-row.active {
    background: color-mix(in srgb, var(--accent) 9%, var(--bg-elev));
    border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
    color: var(--fg-strong);
}

.root-row {
    background: color-mix(in srgb, var(--bg-elev) 72%, transparent);
    border-color: color-mix(in srgb, var(--border) 74%, transparent);
}

.root-row .folder-icon {
    color: var(--fg-muted);
}

.root-row.active .folder-icon {
    color: var(--fg-strong);
}

.folder-icon {
    width: 18px;
    flex-shrink: 0;
}

.name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
}

.tree-row.active .name {
    font-weight: var(--font-weight-medium);
}

.count {
    min-width: 20px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--bg-soft) 78%, transparent);
    font-variant-numeric: tabular-nums;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    line-height: 1;
}

.tree-row.active .count {
    color: var(--fg-muted);
}

.empty {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    list-style: none;
}

.empty__link {
    appearance: none;
    background: transparent;
    border: none;
    padding: 0;
    color: var(--fg-muted);
    font: inherit;
    font-size: var(--text-xs);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: var(--border);
    text-underline-offset: 2px;
    transition: color var(--duration-fast) var(--ease-standard);
}

.empty__link:hover {
    color: var(--accent);
    text-decoration-color: var(--accent);
}
</style>
