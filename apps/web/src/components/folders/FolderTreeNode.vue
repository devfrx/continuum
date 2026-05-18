<script setup lang="ts">
/**
 * FolderTreeNode — recursive tree row with expand/collapse and a context
 * menu (right-click) for create/rename/delete actions.
 *
 * Drag & drop:
 *   • Notes are draggable (the parent NotesSidebar attaches the
 *     `application/x-continuum-note-id` payload). Dropping a note onto a
 *     folder row emits `drop-note` so the host runs `api.notes.move`.
 *   • Folder reparenting via DnD is intentionally deferred to keep the
 *     surface area focused; right-click → "Move to…" covers the same
 *     intent without the ambiguity of cross-tree drops.
 *
 * Inheritance: `icon` and `color` displayed in the row come from the
 * folder's effective values (Modality B walk-up via `useFolders`), so a
 * subfolder without explicit overrides visually mirrors its ancestor.
 */
import { ref, computed, watchEffect } from 'vue';
import { Icon, UiContextMenu, type ContextMenuItem } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import FolderTreeNoteRow from './FolderTreeNoteRow.vue';
import type { FolderNode, Note } from '@continuum/shared';
import type { AppIconName as IconName } from '@/assets/icons';

const props = defineProps<{
    node: FolderNode;
    depth: number;
    selectedId: string | null;
    /** Notes grouped by folder id (key = folder id, key `null` = root). */
    notesByFolder?: Map<string | null, Note[]>;
    /** Currently open note id, used to highlight the note row. */
    selectedNoteId?: string | null;
    /**
     * Folder ids whose subtree contains a search match. When this folder's
     * id is present we force the row to be expanded so the matching note
     * is reachable without manual chevron clicks.
     */
    expandedFolderSet?: Set<string> | null;
    /** Optional predicate filtering which notes to render under this folder. */
    noteFilter?: ((n: Note) => boolean) | null;
}>();

const emit = defineEmits<{
    (e: 'select', id: string): void;
    (e: 'select-note', id: string): void;
    (e: 'delete-note', id: string): void;
    (e: 'create-folder', parentId: string | null): void;
    (e: 'edit-folder', folder: FolderNode): void;
    (e: 'delete-folder', folder: FolderNode): void;
    (e: 'drop-note', payload: { noteId: string; folderId: string | null }): void;
}>();

const folders = useFolders();

const expanded = ref(true);
const dragOver = ref(false);

// Auto-expand when the active search has matches inside this subtree, so
// users never have to manually drill down to find the match.
watchEffect(() => {
    if (props.expandedFolderSet?.has(props.node.id)) expanded.value = true;
});

const isSelected = computed(() => props.selectedId === props.node.id);
const hasChildren = computed(() => props.node.children.length > 0);

/** Notes belonging directly to this folder (post-filter). */
const folderNotes = computed<Note[]>(() => {
    const all = props.notesByFolder?.get(props.node.id) ?? [];
    return props.noteFilter ? all.filter(props.noteFilter) : all;
});
const hasNotes = computed(() => folderNotes.value.length > 0);
const hasContent = computed(() => hasChildren.value || hasNotes.value);

const effective = computed(() => folders.effectiveFor(props.node.id));
const folderIconName = computed<IconName>(() => {
    // Effective icon may be any string from the registry; cast at the boundary.
    const fallback: IconName = expanded.value && hasContent.value ? 'folder-open' : 'folder';
    return (effective.value.icon as IconName) ?? fallback;
});

function onClick(): void { emit('select', props.node.id); }
function toggle(ev: Event): void {
    ev.stopPropagation();
    expanded.value = !expanded.value;
}

function onDragOver(ev: DragEvent): void {
    if (!ev.dataTransfer?.types.includes('application/x-continuum-note-id')) return;
    ev.preventDefault();
    dragOver.value = true;
}
function onDragLeave(): void { dragOver.value = false; }
function onDrop(ev: DragEvent): void {
    ev.preventDefault();
    dragOver.value = false;
    const noteId = ev.dataTransfer?.getData('application/x-continuum-note-id');
    if (noteId) emit('drop-note', { noteId, folderId: props.node.id });
}

// ── Context menu ───────────────────────────────────────────────────────────
const menuOpen = ref(false);
const menuX = ref(0);
const menuY = ref(0);
const menuItems = computed<ContextMenuItem[]>(() => [
    { id: 'new-sub', label: 'New subfolder', icon: 'folder-add', onSelect: () => emit('create-folder', props.node.id) },
    { id: 'edit', label: 'Rename / edit…', icon: 'edit', onSelect: () => emit('edit-folder', props.node) },
    { id: 'div-1', divider: true },
    { id: 'delete', label: 'Delete folder', icon: 'trash', danger: true, onSelect: () => emit('delete-folder', props.node) },
]);

function onContextMenu(ev: MouseEvent): void {
    ev.preventDefault();
    menuX.value = ev.clientX;
    menuY.value = ev.clientY;
    menuOpen.value = true;
}
</script>

<template>
    <li role="treeitem" :aria-selected="isSelected" :aria-expanded="hasContent ? expanded : undefined"
        :class="['tree-item', { 'drag-over': dragOver }]" :style="{ '--depth': depth }">
        <div :class="['tree-row', { active: isSelected }]" @click="onClick"
            @contextmenu="onContextMenu" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
            <span class="indent" aria-hidden="true" />

            <button v-if="hasContent" type="button" class="chev" :aria-label="expanded ? 'Collapse' : 'Expand'"
                @click="toggle">
                <Icon :name="expanded ? 'chevron-down' : 'chevron-right'" :size="10" />
            </button>
            <span v-else class="chev chev--placeholder" aria-hidden="true" />

            <Icon :name="folderIconName" :size="14" class="folder-icon" :style="{ color: effective.color }" />

            <span class="name" :title="node.name">{{ node.name }}</span>
            <span v-if="node.noteCount" class="count">{{ node.noteCount }}</span>
        </div>

        <ul v-if="hasContent && expanded" class="children" role="group">
            <FolderTreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1"
                :selected-id="selectedId" :notes-by-folder="notesByFolder" :selected-note-id="selectedNoteId"
                :expanded-folder-set="expandedFolderSet" :note-filter="noteFilter"
                @select="(id) => emit('select', id)"
                @select-note="(id) => emit('select-note', id)"
                @delete-note="(id) => emit('delete-note', id)"
                @create-folder="(parentId) => emit('create-folder', parentId)"
                @edit-folder="(f) => emit('edit-folder', f)" @delete-folder="(f) => emit('delete-folder', f)"
                @drop-note="(payload) => emit('drop-note', payload)" />

            <FolderTreeNoteRow v-for="n in folderNotes" :key="`note-${n.id}`" :note="n" :depth="depth + 1"
                :selected="n.id === selectedNoteId" @select="(id) => emit('select-note', id)"
                @delete="(id) => emit('delete-note', id)" />
        </ul>

        <UiContextMenu v-model="menuOpen" :x="menuX" :y="menuY" :items="menuItems" />
    </li>
</template>

<style scoped>
/**
 * Recursive folder row.
 *
 * Visual contract intentionally identical to the root "All notes" row in
 * FolderTree.vue (height, padding, hover, active) so the tree reads as a
 * single ordered list. Depth is conveyed by left padding plus a subtle
 * branch guide on expanded groups, giving the unified notes tree enough
 * structure without adding connector clutter around each row.
 */
.tree-item {
    list-style: none;
    min-width: 0;
}

.tree-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 30px;
    padding: 0 var(--space-2);
    padding-left: calc(var(--tree-gutter, var(--space-3)) + var(--depth, 0) * var(--tree-indent, 18px));
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
    border-color: color-mix(in srgb, var(--border) 68%, transparent);
}

.tree-row.active {
    background: color-mix(in srgb, var(--accent) 8%, var(--bg-elev));
    border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
    color: var(--fg-strong);
}

.tree-row.active .name {
    font-weight: var(--font-weight-medium);
}

.tree-item.drag-over>.tree-row {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    outline: var(--border-width-1) dashed var(--accent);
    outline-offset: -2px;
}

.children {
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;
}

.children::before {
    content: '';
    position: absolute;
    left: calc(var(--tree-gutter, var(--space-3)) + var(--depth, 0) * var(--tree-indent, 18px) + 7px);
    top: 2px;
    bottom: 4px;
    width: var(--border-width-1);
    border-radius: var(--radius-pill);
    background: var(--tree-guide-color, color-mix(in srgb, var(--fg-muted) 20%, transparent));
    pointer-events: none;
}

.chev {
    appearance: none;
    background: transparent;
    border: none;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted);
    cursor: pointer;
    border-radius: var(--radius-xs);
    flex-shrink: 0;
}

.chev:hover {
    color: var(--fg-strong);
    background: var(--bg-soft);
}

.chev--placeholder {
    cursor: default;
}

.chev--placeholder:hover {
    background: transparent;
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

</style>
