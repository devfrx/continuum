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
import { onMounted } from 'vue';
import { Icon } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import FolderTreeNode from './FolderTreeNode.vue';
import type { FolderNode } from '@continuum/shared';

defineProps<{
    /** Currently selected folder id; `null` = "All / root". */
    selectedFolderId: string | null;
    /** Total number of root-level (folderless) notes for the All counter. */
    rootNoteCount?: number;
}>();

const emit = defineEmits<{
    (e: 'update:selectedFolderId', value: string | null): void;
    (e: 'create-folder', parentId: string | null): void;
    (e: 'edit-folder', folder: FolderNode): void;
    (e: 'delete-folder', folder: FolderNode): void;
    (e: 'drop-note', payload: { noteId: string; folderId: string | null }): void;
}>();

const folders = useFolders();
onMounted(() => { void folders.load(); });

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
            <li role="treeitem" :aria-selected="selectedFolderId === null"
                :class="['tree-row', 'root-row', { active: selectedFolderId === null }]" @click="selectRoot"
                @dragover.prevent @drop="onRootDrop">
                <Icon name="inbox" :size="14" class="folder-icon" />
                <span class="name">All notes</span>
                <span v-if="rootNoteCount" class="count">{{ rootNoteCount }}</span>
            </li>

            <FolderTreeNode v-for="node in folders.tree.value" :key="node.id" :node="node" :depth="0"
                :selected-id="selectedFolderId" @select="(id) => emit('update:selectedFolderId', id)"
                @create-folder="(parentId) => emit('create-folder', parentId)"
                @edit-folder="(f) => emit('edit-folder', f)" @delete-folder="(f) => emit('delete-folder', f)"
                @drop-note="(payload) => emit('drop-note', payload)" />

            <li v-if="!folders.loading.value && folders.tree.value.length === 0" class="empty">
                <span class="empty__hint">No folders yet.</span>
                <button type="button" class="empty__link" @click="emit('create-folder', null)">
                    Create one
                </button>
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
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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
    gap: var(--space-px);
}

.tree-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--fg);
    user-select: none;
    transition: background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.tree-row:hover {
    background: var(--bg-soft);
}

.tree-row.active {
    background: var(--accent-soft);
    color: var(--fg-strong);
}

.root-row .folder-icon {
    color: var(--fg-muted);
}

.root-row.active .folder-icon {
    color: var(--fg-strong);
}

.folder-icon {
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
