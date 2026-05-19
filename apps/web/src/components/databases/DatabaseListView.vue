<script setup lang="ts">
/**
 * Compact list renderer. Each row is rendered as a horizontal entry
 * with the note title on the left and a one-line resolved-property
 * summary on the right. Title click opens the underlying note.
 *
 * Implements the shared `DatabaseViewSurfaceProps` contract so it can
 * be mounted by the central view registry. Most surface props are
 * unused (`schema`, `activeView`, `draftRequest`) but declared for
 * `<component :is>` interchangeability with the other renderers.
 */
import { Icon } from '@/components/ui';
import { computed } from 'vue';
import type { DatabaseRowSnapshot, PropertyDefinition } from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './views/types';
import { useDatabaseRowDisplay } from './useDatabaseRowDisplay';
import { useConditionalColors } from './conditionalColor';
import { resolveCardProperties } from './views/cardProperties';
import DatabaseCardProperty from './views/DatabaseCardProperty.vue';
import { useDatabaseRowReorder } from './views/useDatabaseRowReorder';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);
const { rowStyleFor, cellStyleFor } = useConditionalColors({
    activeView: computed(() => props.activeView),
    schema: computed(() => props.schema),
});

const {
    orderedRows,
    isDraggingRow,
    isDropTargetRow,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onListDragOver,
    onListDropEnd,
    clearDragState,
} = useDatabaseRowReorder({
    databaseId: computed(() => props.database.id),
    rows: computed(() => props.rows),
    editable: computed(() => props.editable),
    onReordered: () => emit('cell-saved'),
});

function listProperties(): PropertyDefinition[] {
    return resolveCardProperties({
        schema: props.schema,
        view: props.activeView,
        limit: 4,
    });
}

function hasEntry(row: DatabaseRowSnapshot, def: PropertyDefinition): boolean {
    const v = row.properties.find((p) => p.definition.id === def.id)?.value;
    if (!v) return false;
    if (v.type === 'multiSelect' && v.value.length === 0) return false;
    if ((v.type === 'text' || v.type === 'longText' || v.type === 'url' || v.type === 'email' || v.type === 'phone') && !v.value) return false;
    return true;
}

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}
</script>

<template>
    <ul class="db-list" :class="{ 'db-list--wrap': common.wrapContent }"
        @dragover="onListDragOver" @drop="onListDropEnd">
        <li v-if="!orderedRows.length" class="db-list__empty">No rows yet.</li>
        <li v-for="row in orderedRows" :key="row.rowId" data-row-drop-target="true" class="db-list__row"
            :class="{
                'is-dragging': isDraggingRow(row.rowId),
                'is-drop-target': isDropTargetRow(row.rowId),
            }"
            :draggable="editable"
            :style="rowStyleFor(row)"
            @dragstart.stop="(event) => onRowDragStart(event, row)"
            @dragover="(event) => onRowDragOver(event, row)"
            @drop="(event) => onRowDrop(event, row)"
            @dragend="clearDragState">
            <Icon
                v-if="common.showPageIcon"
                :name="iconOf(row.note.kind)"
                :size="14"
                class="db-list__icon"
                :style="{ color: colorOf(row.note.kind) }" />
            <div class="db-list__main" @click="openRow(row)">
                <strong class="db-list__title">{{ row.note.title || 'Untitled' }}</strong>
                <div v-if="listProperties().length" class="db-list__props">
                    <DatabaseCardProperty
                        v-for="def in listProperties()"
                        v-show="hasEntry(row, def)"
                        :key="def.id"
                        class="db-list__prop"
                        :row="row"
                        :property="def"
                        variant="inline"
                        hide-label
                        :cell-style="cellStyleFor(row, def.key)" />
                </div>
            </div>
            <button
                v-if="props.editable"
                type="button"
                class="db-list__action"
                title="Remove from database"
                @click.stop="emit('remove-row', row.rowId)">
                <Icon name="trash" :size="12" />
            </button>
        </li>
    </ul>
</template>

<style scoped>
.db-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.db-list__row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    color: var(--text-primary);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-list__row:hover {
    background: var(--surface-hover);
}

.db-list__row[draggable='true'] {
    cursor: grab;
}

.db-list__row[draggable='true']:active {
    cursor: grabbing;
}

.db-list__row.is-dragging {
    opacity: 0.55;
}

.db-list__row.is-drop-target {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
}

.db-list__icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.db-list__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    gap: var(--space-1);
}

.db-list__title {
    font-size: var(--text-md);
    color: inherit;
    font-weight: var(--font-weight-medium);
    line-height: var(--leading-tight);
}

.db-list__props {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    align-items: center;
    min-width: 0;
}

.db-list__prop {
    min-width: 0;
}

.db-list--wrap .db-list__title {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    word-break: break-word;
}

.db-list__action {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    opacity: 0;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.db-list__row:hover .db-list__action {
    opacity: 1;
}

.db-list__action:hover {
    color: var(--danger);
    background: var(--danger-faint);
}

.db-list__empty {
    padding: var(--space-6);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
}
</style>
