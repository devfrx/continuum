<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import { useKinds } from '@/composables/useKinds';
import { graphDisplayLabel } from '@/utils/graphLabels';
import { excerptSnippet } from '@/utils/snippets';
import { relativeTime } from '@/utils/time';
import type { Note } from '@continuum/shared';

const props = withDefaults(defineProps<{
    note: Note;
    depth?: number;
    selected?: boolean;
    showFolderChip?: boolean;
}>(), {
    depth: 0,
    selected: false,
    showFolderChip: false,
});

const emit = defineEmits<{
    (e: 'select', id: string): void;
    (e: 'delete', id: string): void;
}>();

const folders = useFolders();
const kindStore = useKinds();

const displayTitle = computed(() => graphDisplayLabel(props.note.title?.trim() || 'Untitled', 80));
const snippet = computed(() => excerptSnippet(props.note.content ?? '', 140));
const folderName = computed<string | null>(() => {
    if (!props.showFolderChip || !props.note.folderId) return null;
    return folders.byId(props.note.folderId)?.name ?? null;
});
const tags = computed(() => props.note.tags.slice(0, 2));
const hiddenTagCount = computed(() => Math.max(0, props.note.tags.length - 2));

function onDragStart(ev: DragEvent): void {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/x-continuum-note-id', props.note.id);
}

function onDelete(ev: Event): void {
    ev.stopPropagation();
    emit('delete', props.note.id);
}
</script>

<template>
    <li role="treeitem" :aria-selected="selected" :class="['note-tree-row', { active: selected }]"
        :style="{ '--depth': depth }" draggable="true" @dragstart="onDragStart" @click="emit('select', note.id)">
        <span class="kind-mark" :style="{ '--row-accent': kindStore.colorOf(note.kind) }" :title="note.kind">
            <Icon :name="kindStore.iconOf(note.kind)" :size="14" class="kind-icon" />
        </span>

        <div class="meta">
            <div class="title-row">
                <span class="title" :title="note.title || 'Untitled'">{{ displayTitle }}</span>
                <span class="time" :title="new Date(note.updatedAt).toLocaleString()">
                    {{ relativeTime(note.updatedAt) }}
                </span>
            </div>

            <div v-if="snippet" class="snippet">{{ snippet }}</div>

            <div class="row-tags">
                <span class="kind-chip" :style="{
                    color: kindStore.colorOf(note.kind),
                    borderColor: kindStore.colorOf(note.kind),
                }">{{ note.kind }}</span>
                <span v-if="folderName" class="folder-chip" :title="`In folder: ${folderName}`">
                    <Icon name="folder" :size="10" />
                    <span class="folder-chip__name">{{ folderName }}</span>
                </span>
                <span v-for="tag in tags" :key="tag" class="tag-chip">#{{ tag }}</span>
                <span v-if="hiddenTagCount" class="tag-chip tag-chip--more"
                    :title="note.tags.slice(2).join(', ')">+{{ hiddenTagCount }}</span>
            </div>
        </div>

        <button class="del" title="Delete note" aria-label="Delete note" @click="onDelete">
            <Icon name="close" :size="14" />
        </button>
    </li>
</template>

<style scoped>
.note-tree-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 24px;
    align-items: flex-start;
    gap: var(--space-2);
    min-height: 58px;
    padding: 7px var(--space-2) 7px var(--space-2);
    padding-left: calc(var(--tree-gutter, var(--space-3)) + var(--depth, 0) * var(--tree-indent, 18px));
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--fg);
    position: relative;
    list-style: none;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.note-tree-row:hover {
    background: color-mix(in srgb, var(--bg-soft) 58%, transparent);
    border-color: transparent;
}

.note-tree-row.active {
    background: color-mix(in srgb, var(--accent) 6%, var(--bg-soft));
    border-color: transparent;
    color: var(--fg-strong);
}

.note-tree-row.active::before {
    content: '';
    position: absolute;
    left: calc(var(--tree-gutter, var(--space-3)) + var(--depth, 0) * var(--tree-indent, 18px) - 5px);
    top: 10px;
    bottom: 10px;
    width: 2px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--accent) 78%, var(--fg-strong));
}

.note-tree-row.active .title {
    color: var(--fg-strong);
}

.kind-mark {
    --row-accent: var(--accent);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--row-accent) 8%, transparent);
    color: var(--row-accent);
    flex-shrink: 0;
    margin-top: 2px;
    border: var(--border-width-1) solid color-mix(in srgb, var(--row-accent) 18%, transparent);
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

.title-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
}

.title {
    flex: 1 1 auto;
    color: var(--fg);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.time {
    flex: 0 0 auto;
    color: var(--fg-subtle);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-tight);
}

.note-tree-row.active .time {
    color: var(--fg-subtle);
}

.snippet {
    color: var(--fg-muted);
    font-size: var(--text-xs);
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    word-break: break-word;
}

.row-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 6px;
    min-height: 17px;
    margin-top: 1px;
}

.kind-chip,
.folder-chip,
.tag-chip {
    display: inline-flex;
    align-items: center;
    height: 17px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    font-size: var(--text-2xs);
    line-height: 1;
    min-width: 0;
}

.kind-chip {
    border: var(--border-width-1) solid currentColor;
    background: color-mix(in srgb, currentColor 7%, transparent);
    font-weight: var(--font-weight-semibold);
    text-transform: capitalize;
    letter-spacing: var(--tracking-tight);
}

.folder-chip {
    gap: 3px;
    background: var(--bg-soft);
    color: var(--fg-muted);
    max-width: 120px;
}

.folder-chip__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tag-chip {
    background: transparent;
    color: var(--fg-subtle);
    padding-inline: 2px;
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tag-chip--more {
    color: var(--fg-subtle);
}

.del {
    appearance: none;
    background: transparent;
    border: none;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-subtle);
    cursor: pointer;
    border-radius: var(--radius-xs);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.note-tree-row:hover .del,
.note-tree-row.active .del,
.del:focus-visible {
    opacity: 1;
}

.del:hover {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
}
</style>