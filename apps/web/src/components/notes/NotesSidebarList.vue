<script setup lang="ts">
/**
 * NotesSidebarList — folder/filter list path of the notes sidebar.
 *
 * Renders the conventional list of notes filtered by the current
 * `searchQuery` (substring match against title/kind). Folder scoping is
 * resolved by the parent and passed in via `notes`. The list also shows
 * per-row chips (kind / folder / tags) and a delete affordance.
 */
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import { useKinds } from '@/composables/useKinds';
import { graphDisplayLabel } from '@/utils/graphLabels';
import { relativeTime } from '@/utils/time';
import type { Note } from '@continuum/shared';

const props = defineProps<{
    /** Notes already filtered by folder scope by the parent. */
    notes: Note[];
    selectedId: string | null;
    /** Currently scoped folder; `null` = root. Used to suppress redundant chips. */
    selectedFolderId: string | null;
    searchQuery: string;
}>();

const emit = defineEmits<{
    (e: 'select', id: string): void;
    (e: 'delete', id: string): void;
}>();

const folders = useFolders();
const kindStore = useKinds();

const filtered = computed<Note[]>(() => {
    const q = props.searchQuery.toLowerCase().trim();
    if (!q) return props.notes;
    return props.notes.filter(
        (n) => n.title.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q),
    );
});

function cleanSnippet(s: string): string {
    return s
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function rowSnippet(content: string | null | undefined): string {
    const text = cleanSnippet(content ?? '');
    if (!text) return '';
    if (text.length <= 140) return text;
    const slice = text.slice(0, 140);
    const lastSpace = slice.lastIndexOf(' ');
    return `${(lastSpace > 80 ? slice.slice(0, lastSpace) : slice).trimEnd()}\u2026`;
}

function rowFolderName(note: Note): string | null {
    if (props.selectedFolderId) return null;
    if (!note.folderId) return null;
    return folders.byId(note.folderId)?.name ?? null;
}

function rowRelativeTime(iso: string | null | undefined): string {
    return relativeTime(iso);
}

function displayTitle(title: string | null | undefined): string {
    return graphDisplayLabel(title?.trim() || 'Untitled', 80);
}

function onNoteDragStart(ev: DragEvent, id: string): void {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/x-continuum-note-id', id);
}

function onDelete(id: string, ev: Event): void {
    ev.stopPropagation();
    emit('delete', id);
}

defineExpose({ count: computed(() => filtered.value.length) });
</script>

<template>
    <ul class="note-list">
        <li v-for="n in filtered" :key="n.id" class="note-row" :class="{ active: n.id === selectedId }" draggable="true"
            @dragstart="onNoteDragStart($event, n.id)" @click="emit('select', n.id)">
            <span class="kind-mark" :style="{ '--row-accent': kindStore.colorOf(n.kind) }" :title="n.kind">
                <Icon :name="kindStore.iconOf(n.kind)" :size="14" class="kind-icon" />
            </span>
            <div class="meta">
                <div class="title-row">
                    <span class="title">{{ displayTitle(n.title) }}</span>
                    <span class="time" :title="new Date(n.updatedAt).toLocaleString()">
                        {{ rowRelativeTime(n.updatedAt) }}
                    </span>
                </div>
                <div v-if="rowSnippet(n.content)" class="snippet">{{ rowSnippet(n.content) }}</div>
                <div class="row-tags">
                    <span class="kind-chip" :style="{
                        color: kindStore.colorOf(n.kind),
                        borderColor: kindStore.colorOf(n.kind),
                    }">{{ n.kind }}</span>
                    <span v-if="rowFolderName(n)" class="folder-chip" :title="`In folder: ${rowFolderName(n)}`">
                        <Icon name="folder" :size="10" />
                        <span class="folder-chip__name">{{ rowFolderName(n) }}</span>
                    </span>
                    <span v-for="t in n.tags.slice(0, 2)" :key="t" class="tag-chip">#{{ t }}</span>
                    <span v-if="n.tags.length > 2" class="tag-chip tag-chip--more"
                        :title="n.tags.slice(2).join(', ')">+{{ n.tags.length - 2 }}</span>
                </div>
            </div>
            <button class="del" title="Delete note" aria-label="Delete note" @click="onDelete(n.id, $event)">
                <Icon name="close" :size="14" />
            </button>
        </li>
        <li v-if="!notes.length" class="empty">No notes yet — create one.</li>
        <li v-else-if="!filtered.length" class="empty">No matches.</li>
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

.note-row.active::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    border-radius: 2px;
    background: var(--accent);
}

.note-row.active .title {
    color: var(--fg-strong);
}

.kind-mark {
    --row-accent: var(--accent);
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--row-accent) 10%, transparent);
    color: var(--row-accent);
    flex-shrink: 0;
    margin-top: 1px;
    border: var(--border-width-1) solid color-mix(in srgb, var(--row-accent) 24%, transparent);
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

.note-row.active .time {
    color: var(--fg-muted);
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

.row-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin-top: 2px;
}

.kind-chip {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    border: var(--border-width-1) solid currentColor;
    background: transparent;
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    text-transform: capitalize;
    letter-spacing: var(--tracking-tight);
    line-height: 1;
}

.folder-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 16px;
    max-width: 110px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--bg-soft);
    color: var(--fg-subtle);
    font-size: var(--text-2xs);
    line-height: 1;
}

.folder-chip__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tag-chip {
    display: inline-flex;
    align-items: center;
    height: 16px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-medium);
    line-height: 1;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tag-chip--more {
    background: var(--bg-soft);
    color: var(--fg-muted);
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
    align-self: flex-start;
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
</style>
