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
import { ref, computed } from 'vue';
import { Icon, UiContextMenu, type ContextMenuItem } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import type { FolderNode } from '@continuum/shared';
import type { AppIconName as IconName } from '@/assets/icons';

const props = defineProps<{
    node: FolderNode;
    depth: number;
    selectedId: string | null;
}>();

const emit = defineEmits<{
    (e: 'select', id: string): void;
    (e: 'create-folder', parentId: string | null): void;
    (e: 'edit-folder', folder: FolderNode): void;
    (e: 'delete-folder', folder: FolderNode): void;
    (e: 'drop-note', payload: { noteId: string; folderId: string | null }): void;
}>();

const folders = useFolders();

const expanded = ref(true);
const dragOver = ref(false);

const isSelected = computed(() => props.selectedId === props.node.id);
const hasChildren = computed(() => props.node.children.length > 0);

const effective = computed(() => folders.effectiveFor(props.node.id));
const folderIconName = computed<IconName>(() => {
    // Effective icon may be any string from the registry; cast at the boundary.
    const fallback: IconName = expanded.value && hasChildren.value ? 'folder-open' : 'folder';
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
    <li role="treeitem" :aria-selected="isSelected" :aria-expanded="hasChildren ? expanded : undefined"
        :class="['tree-item', { 'drag-over': dragOver }]">
        <div :class="['tree-row', { active: isSelected }]" :style="{ '--depth': depth }" @click="onClick"
            @contextmenu="onContextMenu" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
            <span class="indent" aria-hidden="true" />

            <button v-if="hasChildren" type="button" class="chev" :aria-label="expanded ? 'Collapse' : 'Expand'"
                @click="toggle">
                <Icon :name="expanded ? 'chevron-down' : 'chevron-right'" :size="10" />
            </button>
            <span v-else class="chev chev--placeholder" aria-hidden="true" />

            <Icon :name="folderIconName" :size="14" class="folder-icon" :style="{ color: effective.color }" />

            <span class="name" :title="node.name">{{ node.name }}</span>
            <span v-if="node.noteCount" class="count">{{ node.noteCount }}</span>
        </div>

        <ul v-if="hasChildren && expanded" class="children" role="group">
            <FolderTreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1"
                :selected-id="selectedId" @select="(id) => emit('select', id)"
                @create-folder="(parentId) => emit('create-folder', parentId)"
                @edit-folder="(f) => emit('edit-folder', f)" @delete-folder="(f) => emit('delete-folder', f)"
                @drop-note="(payload) => emit('drop-note', payload)" />
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
 * single ordered list. Depth is conveyed only by left padding — no
 * vertical guides or connectors, which kept the surface noisy at deep
 * trees in earlier iterations.
 */
.tree-item {
    list-style: none;
}

.tree-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-3);
    padding-left: calc(var(--space-3) + var(--depth, 0) * var(--space-4));
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
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-px);
    margin-top: var(--space-px);
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
    font-variant-numeric: tabular-nums;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    line-height: 1;
}

.tree-row.active .count {
    color: var(--fg-muted);
}
</style>
