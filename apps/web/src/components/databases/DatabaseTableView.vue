<script setup lang="ts">
/**
 * Table view body — the workhorse renderer for Notion-style databases.
 *
 * Layout:
 *
 *   ┌────────┬───────────┬───────────┬─────┐
 *   │ Name   │ Property1 │ Property2 │  +  │  ← column header row
 *   ├────────┼───────────┼───────────┼─────┤
 *   │ Row    │  cell     │  cell     │  ⋮  │
 *   └────────┴───────────┴───────────┴─────┘
 *
 *   – Column header carries one column per *visible* schema property
 *     plus a trailing "+ Property" button that opens the shared
 *     `AddPropertyModal` (same UX as the per-note properties panel,
 *     scoped to the database).
 *   – Each row has a sticky "Name" cell on the left (editable, opens
 *     the underlying note) followed by one `<DatabaseCell>` per
 *     property.
 *   – Hover reveals a per-row "🗑" action that removes the row, and a
 *     per-column menu (click on the column header) with rename / delete.
 *   – The active view's `visibleProperties` / `hiddenProperties`
 *     decides which columns to show; the saved order in
 *     `visibleProperties` wins over the schema's natural order.
 *
 * Title editing uses `api.notes.update` directly to avoid coupling the
 * embed to the note-editor composables; the resolver picks the change
 * up on the next query refresh.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { api } from '@/api';
import { Icon, UiConfirmModal } from '@/components/ui';
import AddPropertyModal from '@/components/properties/AddPropertyModal.vue';
import {
    publishDatabaseRowsChanged,
    publishDatabaseSchemaChanged,
    publishNoteUpdated,
} from '@/lib/realtime';
import type {
    DatabaseRowSnapshot,
    NoteProperty,
    PropertyDefinition,
} from '@continuum/shared';
import DatabaseCell from './DatabaseCell.vue';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './views/types';
import { useDatabaseRowDisplay } from './useDatabaseRowDisplay';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();

const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);

// ── Layout knobs persisted from the view-settings popover ─────────────────
// Reads `view.config.layout.showVerticalLines` (table-only) plus the
// shared common-display toggles (`showPageIcon`, `wrapContent`, `openIn`). Defaults match the
// historical look (lines visible, no wrapping) so existing views keep
// their appearance until the user opts in.
const showVerticalLines = computed<boolean>(() => {
    const v = (props.activeView.config.layout as { showVerticalLines?: boolean } | null | undefined)
        ?.showVerticalLines;
    return v ?? true;
});

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}

// ── Property add modal ────────────────────────────────────────────────────
const showAddProperty = ref(false);

function openAddProperty(): void {
    if (!props.editable) return;
    showAddProperty.value = true;
}

function onPropertyCreated(): void {
    showAddProperty.value = false;
    publishDatabaseSchemaChanged(props.database.id);
    emit('schema-changed');
}

// ── Column visibility from the active view ────────────────────────────────
const visibleSchema = computed<PropertyDefinition[]>(() => {
    const view = props.activeView;
    if (!view) return props.schema;
    const visible = view.config.visibleProperties;
    const hidden = new Set(view.config.hiddenProperties ?? []);

    if (visible && visible.length > 0) {
        // Respect both the explicit order and the explicit subset; ignore
        // any saved keys that no longer exist on the schema.
        const byKey = new Map(props.schema.map((p) => [p.key, p] as const));
        const ordered: PropertyDefinition[] = [];
        for (const key of visible) {
            if (hidden.has(key)) continue;
            const def = byKey.get(key);
            if (def) ordered.push(def);
        }
        return ordered;
    }
    // No explicit visibility list: show all schema properties except those
    // the user has actively hidden in this view.
    return props.schema.filter((p) => !hidden.has(p.key));
});

const gridTemplate = computed(() => {
    const columns = visibleSchema.value.map(() => 'minmax(160px, 1fr)').join(' ');
    return `minmax(220px, 1.8fr) ${columns} minmax(104px, 112px)`;
});

function entryFor(row: DatabaseRowSnapshot, definitionId: string): NoteProperty | null {
    return row.properties.find((p) => p.definition.id === definitionId) ?? null;
}

async function saveTitle(row: DatabaseRowSnapshot, event: Event): Promise<void> {
    if (!props.editable) return;
    const next = (event.target as HTMLInputElement).value.trim();
    if (next === row.note.title) return;
    await api.notes.update(row.note.id, { title: next });
    publishNoteUpdated(row.note.id);
    publishDatabaseRowsChanged(props.database.id, { rowNoteId: row.note.id });
    emit('cell-saved');
}

// ── Draft row creation ───────────────────────────────────────────────────
const draftRowVisible = ref(false);
const draftRowTitle = ref('');
const draftRowCreating = ref(false);
const draftRowError = ref<string | null>(null);
const draftRowInput = ref<HTMLInputElement | null>(null);

function startDraftRow(): void {
    if (!props.editable) return;
    draftRowError.value = null;
    draftRowVisible.value = true;
    void nextTick(() => draftRowInput.value?.focus());
}

function cancelDraftRow(): void {
    if (draftRowCreating.value) return;
    draftRowVisible.value = false;
    draftRowTitle.value = '';
    draftRowError.value = null;
}

async function commitDraftRow(): Promise<void> {
    if (!props.editable || draftRowCreating.value) return;
    const title = draftRowTitle.value.trim();
    if (!title) {
        cancelDraftRow();
        return;
    }
    draftRowCreating.value = true;
    draftRowError.value = null;
    try {
        await api.databases.rows.create(props.database.id, { title });
        draftRowVisible.value = false;
        draftRowTitle.value = '';
        publishDatabaseRowsChanged(props.database.id);
        emit('row-created');
    } catch (err) {
        draftRowError.value = err instanceof Error ? err.message : 'Unable to create row';
    } finally {
        draftRowCreating.value = false;
    }
}

watch(
    () => props.draftRequest,
    (request, previous) => {
        if (request !== previous) startDraftRow();
    },
);

// ── Column header menu (rename / delete) ─────────────────────────────────
// UX contract: left-click on a column header starts an inline rename
// (the most common action). Right-click opens the contextual menu with
// rename / delete. We deliberately stop the contextmenu event from
// bubbling so the surrounding editor's block-insert context menu does
// NOT fire when interacting with a database column or row.
const headerMenuFor = ref<string | null>(null);
const renameDraftId = ref<string | null>(null);
const renameDraftValue = ref('');
const deletePropertyTarget = ref<PropertyDefinition | null>(null);

const deletePropertyMessage = computed(() => {
    const def = deletePropertyTarget.value;
    return def
        ? `Delete property "${def.label}"? This removes the column and its values from every row.`
        : '';
});

function openHeaderMenu(definitionId: string, event: MouseEvent): void {
    if (!props.editable) return;
    event.preventDefault();
    headerMenuFor.value = definitionId;
}

function closeHeaderMenu(): void {
    headerMenuFor.value = null;
}

function startRename(def: PropertyDefinition): void {
    if (!props.editable) return;
    renameDraftId.value = def.id;
    renameDraftValue.value = def.label;
    closeHeaderMenu();
}

function cancelRename(): void {
    renameDraftId.value = null;
    renameDraftValue.value = '';
}

async function commitRename(def: PropertyDefinition): Promise<void> {
    const next = renameDraftValue.value.trim();
    cancelRename();
    if (!next || next === def.label) return;
    await api.properties.update(def.id, { label: next });
    publishDatabaseSchemaChanged(props.database.id);
    emit('schema-changed');
}

function requestDeleteProperty(def: PropertyDefinition): void {
    closeHeaderMenu();
    deletePropertyTarget.value = def;
}

async function confirmDeleteProperty(): Promise<void> {
    const def = deletePropertyTarget.value;
    deletePropertyTarget.value = null;
    if (!def) return;
    await api.properties.remove(def.id);
    publishDatabaseSchemaChanged(props.database.id);
    emit('schema-changed');
}

function onDocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (headerMenuFor.value
        && !target.closest('.db-table__col-menu')
        && !target.closest('.db-table__col-trigger')) {
        closeHeaderMenu();
    }
    if (rowMenu.value
        && !target.closest('.db-table__row-menu')
        && !target.closest('.db-table__row')) {
        closeRowMenu();
    }
}

// ── Row context menu (right-click) ───────────────────────────────────────
// Right-click anywhere on a row pops a small menu with the row-scoped
// actions. We render it as a fixed-positioned popover anchored to the
// pointer so it works regardless of which cell triggered it.
interface RowMenuState {
    rowId: string;
    noteId: string;
    x: number;
    y: number;
}
const rowMenu = ref<RowMenuState | null>(null);
const deleteRowTarget = ref<DatabaseRowSnapshot | null>(null);

const deleteRowMessage = computed(() => {
    const row = deleteRowTarget.value;
    return row
        ? `Remove row "${row.note.title || 'Untitled'}" from this database? The underlying note is kept and can be linked again later.`
        : '';
});

function openRowMenu(row: DatabaseRowSnapshot, event: MouseEvent): void {
    if (!props.editable) return;
    event.preventDefault();
    rowMenu.value = {
        rowId: row.rowId,
        noteId: row.noteId,
        x: event.clientX,
        y: event.clientY,
    };
}

function closeRowMenu(): void {
    rowMenu.value = null;
}

function openRowFromMenu(): void {
    const state = rowMenu.value;
    closeRowMenu();
    if (!state) return;
    const row = props.rows.find((r) => r.rowId === state.rowId);
    if (row) openRow(row);
}

function requestDeleteRow(): void {
    const state = rowMenu.value;
    closeRowMenu();
    if (!state) return;
    const row = props.rows.find((r) => r.rowId === state.rowId);
    if (row) deleteRowTarget.value = row;
}

function confirmDeleteRow(): void {
    const row = deleteRowTarget.value;
    deleteRowTarget.value = null;
    if (row) emit('remove-row', row.rowId);
}

// Swallow the editor's contextmenu when right-clicking inside the
// database surface — we provide our own row/column menus and don't want
// the surrounding TipTap block-insert menu to interfere.
function onRootContextMenu(event: MouseEvent): void {
    event.stopPropagation();
}

document.addEventListener('mousedown', onDocClick);
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
    <div
        class="db-table"
        :class="{
            'db-table--no-vlines': !showVerticalLines,
            'db-table--wrap': common.wrapContent,
        }"
        role="table"
        @contextmenu="onRootContextMenu">
        <div class="db-table__head" role="row" :style="{ gridTemplateColumns: gridTemplate }">
            <div class="db-table__cell db-table__cell--title db-table__cell--header" role="columnheader">
                <Icon name="prop-text" :size="12" />
                <span>Name</span>
            </div>
            <div
                v-for="property in visibleSchema"
                :key="property.id"
                class="db-table__cell db-table__cell--header"
                role="columnheader">
                <template v-if="renameDraftId === property.id">
                    <input
                        v-model="renameDraftValue"
                        class="db-table__col-rename"
                        autofocus
                        @keydown.enter="commitRename(property)"
                        @keydown.escape="cancelRename"
                        @blur="commitRename(property)" />
                </template>
                <template v-else>
                    <Icon :name="property.icon ?? 'circle'" :size="12" />
                    <button
                        type="button"
                        class="db-table__col-trigger"
                        :title="editable ? 'Click to rename — right-click for more' : property.label"
                        @click="startRename(property)"
                        @contextmenu.stop="openHeaderMenu(property.id, $event)">
                        {{ property.label }}
                    </button>
                    <div v-if="headerMenuFor === property.id && editable" class="db-table__col-menu" role="menu">
                        <button type="button" class="db-table__col-menu-item" @click="startRename(property)">
                            <Icon name="edit" :size="12" />
                            <span>Rename</span>
                        </button>
                        <button type="button" class="db-table__col-menu-item db-table__col-menu-item--danger" @click="requestDeleteProperty(property)">
                            <Icon name="trash" :size="12" />
                            <span>Delete property</span>
                        </button>
                    </div>
                </template>
            </div>
            <div class="db-table__cell db-table__cell--header db-table__cell--add">
                <button v-if="editable" type="button" class="db-table__add-btn" @click="openAddProperty" title="Add a configurable property">
                    <Icon name="plus" :size="12" />
                    <span>Property</span>
                </button>
            </div>
        </div>

        <div v-if="!rows.length && !draftRowVisible" class="db-table__empty">
            No rows yet — use <strong>+ New row</strong> to start the first row.
        </div>

        <div v-for="row in rows" :key="row.rowId" class="db-table__row" role="row" :style="{ gridTemplateColumns: gridTemplate }" @contextmenu.stop="openRowMenu(row, $event)">
            <div class="db-table__cell db-table__cell--title" role="cell">
                <Icon
                    v-if="common.showPageIcon"
                    :name="iconOf(row.note.kind)"
                    :size="13"
                    class="db-table__page-icon"
                    :style="{ color: colorOf(row.note.kind) }" />
                <input
                    class="db-table__title-input"
                    :value="row.note.title"
                    placeholder="Untitled row"
                    :readonly="!editable || row.note.locked"
                    @blur="saveTitle(row, $event)" />
                <button
                    type="button"
                    class="db-table__open-btn"
                    title="Open page"
                    @click="openRow(row)">
                    <Icon name="chevron-right" :size="12" />
                </button>
            </div>
            <div
                v-for="property in visibleSchema"
                :key="property.id"
                class="db-table__cell"
                role="cell">
                <DatabaseCell
                    :note-id="row.noteId"
                    :entry="entryFor(row, property.id)"
                    :editable="editable && !row.note.locked"
                    @saved="emit('cell-saved')" />
            </div>
            <div class="db-table__cell db-table__cell--actions">
                <button
                    v-if="editable"
                    type="button"
                    class="db-table__row-action"
                    title="Remove row"
                    @click="emit('remove-row', row.rowId)">
                    <Icon name="trash" :size="12" />
                </button>
            </div>
        </div>

        <div v-if="draftRowVisible" class="db-table__row db-table__row--draft" role="row" :style="{ gridTemplateColumns: gridTemplate }">
            <div class="db-table__cell db-table__cell--title" role="cell">
                <input
                    ref="draftRowInput"
                    v-model="draftRowTitle"
                    class="db-table__title-input"
                    placeholder="New row"
                    :readonly="draftRowCreating"
                    @keydown.enter.prevent="commitDraftRow"
                    @keydown.escape="cancelDraftRow"
                    @blur="commitDraftRow" />
            </div>
            <div
                v-for="property in visibleSchema"
                :key="`draft-${property.id}`"
                class="db-table__cell db-table__cell--draft"
                role="cell" />
            <div class="db-table__cell db-table__cell--actions">
                <button
                    v-if="!draftRowCreating"
                    type="button"
                    class="db-table__row-action"
                    title="Cancel row"
                    @mousedown.prevent
                    @click="cancelDraftRow">
                    <Icon name="close" :size="12" />
                </button>
            </div>
        </div>

        <div v-if="draftRowError" class="db-table__draft-error">
            {{ draftRowError }}
        </div>

        <div v-if="editable" class="db-table__footer" role="row" :style="{ gridTemplateColumns: gridTemplate }">
            <div class="db-table__cell db-table__cell--title db-table__footer-cell" role="cell">
                <button type="button" class="db-table__footer-btn" @click="startDraftRow">
                    <Icon name="plus" :size="12" />
                    <span>New row</span>
                </button>
            </div>
            <div
                v-for="property in visibleSchema"
                :key="`footer-${property.id}`"
                class="db-table__cell db-table__footer-cell db-table__footer-spacer"
                role="cell" />
            <div class="db-table__cell db-table__cell--actions db-table__footer-cell" role="cell" />
        </div>

        <AddPropertyModal
            v-if="editable"
            v-model="showAddProperty"
            owner="database"
            :database-id="database.id"
            :database-properties="schema"
            @created="onPropertyCreated" />

        <div
            v-if="rowMenu"
            class="db-table__row-menu"
            role="menu"
            :style="{ top: `${rowMenu.y}px`, left: `${rowMenu.x}px` }">
            <button type="button" class="db-table__col-menu-item" @click="openRowFromMenu">
                <Icon name="chevron-right" :size="12" />
                <span>Open page</span>
            </button>
            <button type="button" class="db-table__col-menu-item db-table__col-menu-item--danger" @click="requestDeleteRow">
                <Icon name="trash" :size="12" />
                <span>Delete row</span>
            </button>
        </div>
    </div>

    <UiConfirmModal
        :model-value="!!deletePropertyTarget"
        title="Delete property"
        :message="deletePropertyMessage"
        confirm-label="Delete"
        confirm-variant="danger"
        @update:model-value="(v) => { if (!v) deletePropertyTarget = null; }"
        @confirm="confirmDeleteProperty" />
    <UiConfirmModal
        :model-value="!!deleteRowTarget"
        title="Delete row"
        :message="deleteRowMessage"
        confirm-label="Delete"
        confirm-variant="danger"
        @update:model-value="(v) => { if (!v) deleteRowTarget = null; }"
        @confirm="confirmDeleteRow" />
</template>

<style scoped>
/**
 * Table renderer — Notion-style spreadsheet surface with sticky
 * header, hover-revealed actions, and consistent token-driven sizing.
 */
.db-table {
    display: flex;
    flex-direction: column;
    font-size: var(--text-sm);
    overflow-x: auto;
    scrollbar-gutter: stable;
    background: var(--surface-0);
    color: var(--text-primary);
}

.db-table__head,
.db-table__row,
.db-table__footer {
    display: grid;
    align-items: stretch;
    border-bottom: var(--border-width-1) solid var(--border);
}

.db-table__head {
    background: var(--surface-1);
    font-weight: var(--font-weight-semibold);
    color: var(--text-muted);
    border-bottom: var(--border-width-1) solid var(--border-strong);
    position: sticky;
    top: 0;
    z-index: 2;
}

.db-table__cell {
    padding: var(--space-2) var(--space-3);
    border-right: var(--border-width-1) solid var(--border);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    position: relative;
}

.db-table__cell:last-child {
    border-right: var(--border-width-1) solid var(--border);
}

.db-table--no-vlines .db-table__cell {
    border-right: none;
}

.db-table--wrap .db-table__cell {
    align-items: flex-start;
    white-space: normal;
    word-break: break-word;
}

.db-table__cell--header {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.db-table__cell--title {
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
}

.db-table__row .db-table__cell--title {
    background: transparent;
}

.db-table__row {
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-table__row:hover {
    background: var(--surface-hover);
}

.db-table__row--draft {
    background: var(--surface-1);
}

.db-table__title-input {
    width: 100%;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
}

.db-table__title-input:focus {
    outline: 2px solid var(--accent-medium);
    outline-offset: -1px;
}

.db-table__page-icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.db-table__open-btn {
    border: 0;
    background: transparent;
    color: var(--text-muted);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
    display: inline-flex;
    align-items: center;
}

.db-table__row:hover .db-table__open-btn {
    opacity: 1;
}

.db-table__open-btn:hover {
    color: var(--text-primary);
    background: var(--surface-active);
}

.db-table__col-trigger {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    padding: 0;
    font: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    text-align: left;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color var(--duration-fast) var(--ease-standard);
}

.db-table__col-trigger:hover {
    color: var(--text-primary);
}

.db-table__col-rename {
    flex: 1;
    min-width: 0;
    border: var(--border-width-1) solid var(--accent);
    background: var(--surface-2);
    color: var(--text-primary);
    font: inherit;
    text-transform: none;
    letter-spacing: normal;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    outline: none;
}

.db-table__col-menu,
.db-table__row-menu {
    min-width: 180px;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    display: flex;
    flex-direction: column;
    padding: var(--space-1);
}

.db-table__col-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: var(--space-1);
    z-index: 10;
}

.db-table__row-menu {
    position: fixed;
    z-index: var(--z-overlay);
}

.db-table__col-menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font-size: var(--text-sm);
    text-transform: none;
    letter-spacing: normal;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-table__col-menu-item:hover {
    background: var(--surface-hover);
}

.db-table__col-menu-item--danger {
    color: var(--danger);
}

.db-table__col-menu-item--danger:hover {
    background: var(--danger-faint);
}

.db-table__cell--actions,
.db-table__cell--add {
    justify-content: center;
}

.db-table__cell--add {
    padding-inline: var(--space-2);
}

.db-table__cell--draft {
    color: var(--text-muted);
}

.db-table__add-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font: inherit;
    text-transform: none;
    letter-spacing: normal;
    max-width: 100%;
    white-space: nowrap;
    transition:
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.db-table__add-btn:hover {
    color: var(--text-primary);
    background: var(--surface-active);
}

.db-table__row-action {
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

.db-table__row:hover .db-table__row-action {
    opacity: 1;
}

.db-table__row-action:hover {
    background: var(--danger-faint);
    color: var(--danger);
}

.db-table__empty {
    padding: var(--space-6);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
}

.db-table__draft-error {
    padding: var(--space-2) var(--space-3);
    color: var(--danger);
    background: var(--danger-faint);
    border-bottom: var(--border-width-1) solid var(--danger-border);
    font-size: var(--text-xs);
}

.db-table__footer {
    background: var(--surface-0);
    border-top: var(--border-width-1) solid var(--border-strong);
}

.db-table__footer-cell {
    min-height: 40px;
    color: var(--text-muted);
}

.db-table__footer-spacer {
    pointer-events: none;
}

.db-table__footer-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    border: 0;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--text-sm);
    transition:
        color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.db-table__footer-btn:hover {
    color: var(--text-primary);
    background: var(--surface-active);
}
</style>
