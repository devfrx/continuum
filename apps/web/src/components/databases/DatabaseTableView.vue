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
 *     per-column menu (right-click on the column header) with rename,
 *     replace, filter, sort, and delete actions.
 *   – The active view's `visibleProperties` / `hiddenProperties`
 *     decides which columns to show; the saved order in
 *     `visibleProperties` wins over the schema's natural order.
 *
 * Title editing uses `api.notes.update` directly to avoid coupling the
 * embed to the note-editor composables; the resolver picks the change
 * up on the next query refresh.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
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
import { PROPERTY_TYPE_ICONS } from '@continuum/shared';
import DatabaseCell from './DatabaseCell.vue';
import {
    canSortProperty,
    withoutPropertyFilter,
    withoutPropertySort,
} from './propertyHeaderActions';
import DatabasePropertyHeaderMenu from './contextMenus/DatabasePropertyHeaderMenu.vue';
import DatabaseRowMenu from './contextMenus/DatabaseRowMenu.vue';
import PropertyIconPicker from '@/components/properties/iconPicker/PropertyIconPicker.vue';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './views/types';
import { useDatabaseRowDisplay } from './useDatabaseRowDisplay';
import { useConditionalColors } from './conditionalColor';
import {
    patchPropertyOrder,
    resolveViewProperties,
    type DropInsertPosition,
} from './viewProperties';
import {
    DRAG_MIME,
    useDragSource,
    useDropTarget,
    type DragSourceHandlers,
    type DropTargetHandlers,
} from '@/composables/useDragAndDrop';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();

const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);
const activeViewRef = computed(() => props.activeView);
const schemaRef = computed(() => props.schema);
const { rowStyleFor, cellStyleFor } = useConditionalColors({
    activeView: activeViewRef,
    schema: schemaRef,
});

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

function propertyIcon(property: PropertyDefinition): string {
    return property.icon ?? PROPERTY_TYPE_ICONS[property.type];
}

// ── Column visibility from the active view ────────────────────────────────
const visibleSchema = computed<PropertyDefinition[]>(() => resolveViewProperties({
    schema: props.schema,
    view: props.activeView,
}));

// ── Column order drag-and-drop ──────────────────────────────────────────
// The persisted order uses property keys (`visibleProperties`) while the
// transient drag surface can use the shared property MIME. Keeping this
// logic in the table means direct header dragging and the Properties
// settings panel write the exact same view config shape.
const TABLE_COLUMN_DRAG_KIND = 'database-table-column';

const draggedColumnKey = ref<string | null>(null);
const dropColumnKey = ref<string | null>(null);
const dropColumnPosition = ref<DropInsertPosition>('before');

const columnSources = new Map<string, { isDragging: Ref<boolean>; handlers: DragSourceHandlers }>();
const columnTargets = new Map<string, { isOver: Ref<boolean>; handlers: DropTargetHandlers }>();

function columnDropPosition(event: DragEvent): DropInsertPosition {
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!target) return 'before';
    const rect = target.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
}

function updateColumnDropState(propertyKey: string, event: DragEvent): void {
    if (draggedColumnKey.value === propertyKey) return;
    dropColumnKey.value = propertyKey;
    dropColumnPosition.value = columnDropPosition(event);
}

function clearColumnDropState(): void {
    dropColumnKey.value = null;
    dropColumnPosition.value = 'before';
}

function clearColumnDragState(): void {
    draggedColumnKey.value = null;
    clearColumnDropState();
}

function columnSourceHandlers(property: PropertyDefinition): DragSourceHandlers {
    const cached = columnSources.get(property.key);
    if (cached) return cached.handlers;
    const source = useDragSource({
        mime: DRAG_MIME.propertyId,
        kind: TABLE_COLUMN_DRAG_KIND,
        disabled: () => !props.editable || visibleSchema.value.length < 2,
        getPayload: () => property.key,
        onStart: () => {
            cancelRename();
            closeHeaderMenu();
            draggedColumnKey.value = property.key;
        },
        onEnd: clearColumnDragState,
    });
    columnSources.set(property.key, { isDragging: source.isDragging, handlers: source.dragHandlers });
    return source.dragHandlers;
}

function columnTargetHandlers(property: PropertyDefinition): DropTargetHandlers {
    const cached = columnTargets.get(property.key);
    if (cached) return cached.handlers;
    const target = useDropTarget({
        accept: DRAG_MIME.propertyId,
        acceptKind: TABLE_COLUMN_DRAG_KIND,
        disabled: () => !props.editable || visibleSchema.value.length < 2,
        onEnter: (event) => updateColumnDropState(property.key, event),
        onOver: (event) => updateColumnDropState(property.key, event),
        onLeave: () => {
            if (dropColumnKey.value === property.key) clearColumnDropState();
        },
        onDrop: (payload, event) => {
            const patch = patchPropertyOrder(
                props.schema,
                props.activeView,
                payload,
                property.key,
                columnDropPosition(event),
            );
            clearColumnDragState();
            if (patch) emit('view-config-changed', patch);
        },
    });
    columnTargets.set(property.key, { isOver: target.isOver, handlers: target.dropHandlers });
    return target.dropHandlers;
}

function columnDragHandlers(property: PropertyDefinition): DragSourceHandlers & DropTargetHandlers {
    return {
        ...columnSourceHandlers(property),
        ...columnTargetHandlers(property),
    };
}

function isColumnDragging(propertyKey: string): boolean {
    return draggedColumnKey.value === propertyKey;
}

function isColumnDropTarget(propertyKey: string, position: DropInsertPosition): boolean {
    return dropColumnKey.value === propertyKey
        && dropColumnPosition.value === position
        && draggedColumnKey.value !== propertyKey;
}

// ── Column widths (table-only layout state) ──────────────────────────────
// Widths are view-scoped, not datasource-scoped: a property name/icon/config
// belongs to the datasource, while table column geometry belongs to this
// saved view. Keys mirror the view config property-key convention.
const TITLE_COLUMN_KEY = '__title';
const TITLE_COLUMN_MIN = 180;
const PROPERTY_COLUMN_MIN = 96;

const tableLayout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const liveColumnWidths = ref<Record<string, number>>({});

function persistedColumnWidths(): Record<string, number> {
    const raw = tableLayout.value.columnWidths;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            out[key] = value;
        }
    }
    return out;
}

function columnWidth(key: string): number | null {
    return liveColumnWidths.value[key] ?? persistedColumnWidths()[key] ?? null;
}

function columnTrack(key: string, fallback: string): string {
    const width = columnWidth(key);
    return width ? `${Math.round(width)}px` : fallback;
}

const gridTemplate = computed(() => {
    const columns = visibleSchema.value
        .map((property) => columnTrack(property.key, 'minmax(160px, 1fr)'))
        .join(' ');
    return `${columnTrack(TITLE_COLUMN_KEY, 'minmax(220px, 1.8fr)')} ${columns} minmax(104px, 112px)`;
});

watch(
    () => props.activeView.id,
    () => { liveColumnWidths.value = {}; },
);

interface ColumnResizeState {
    key: string;
    startX: number;
    startWidth: number;
    minWidth: number;
}

const columnResize = ref<ColumnResizeState | null>(null);

function startColumnResize(key: string, event: PointerEvent, minWidth: number): void {
    if (!props.editable) return;
    const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    const header = handle?.closest('.db-table__cell');
    const startWidth = header instanceof HTMLElement
        ? header.getBoundingClientRect().width
        : columnWidth(key) ?? minWidth;
    columnResize.value = {
        key,
        startX: event.clientX,
        startWidth,
        minWidth,
    };
    event.preventDefault();
    event.stopPropagation();
    handle?.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onColumnResizeMove);
    window.addEventListener('pointerup', onColumnResizeEnd, { once: true });
}

function onColumnResizeMove(event: PointerEvent): void {
    const state = columnResize.value;
    if (!state) return;
    const nextWidth = Math.max(state.minWidth, state.startWidth + event.clientX - state.startX);
    liveColumnWidths.value = {
        ...liveColumnWidths.value,
        [state.key]: nextWidth,
    };
}

function onColumnResizeEnd(): void {
    const state = columnResize.value;
    window.removeEventListener('pointermove', onColumnResizeMove);
    columnResize.value = null;
    if (!state) return;
    const next = {
        ...persistedColumnWidths(),
        ...liveColumnWidths.value,
    };
    emit('view-config-changed', { layout: { columnWidths: next } });
}

onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onColumnResizeMove);
    window.removeEventListener('pointerup', onColumnResizeEnd);
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
interface HeaderMenuState {
    definitionId: string;
    x: number;
    y: number;
    triggerEl: HTMLElement | null;
}

const headerMenu = ref<HeaderMenuState | null>(null);
const renameDraftId = ref<string | null>(null);
const renameDraftValue = ref('');
const replacePropertyTarget = ref<PropertyDefinition | null>(null);
const deletePropertyTarget = ref<PropertyDefinition | null>(null);

// ── Per-column header element refs (anchors for popovers) ─────────────────
// Vue's template `:ref` callback gives us the DOM node for each header
// cell. We key the map by `PropertyDefinition.id` so popovers can look
// up their trigger element by id alone, even when the schema reorders.
const headerRefs = ref<Record<string, HTMLElement>>({});

function setHeaderRef(propertyId: string, el: unknown): void {
    if (el instanceof HTMLElement) {
        headerRefs.value[propertyId] = el;
    } else {
        delete headerRefs.value[propertyId];
    }
}

// ── Icon picker + settings popovers ───────────────────────────────────────
// Both popovers share the same shape: a target `definitionId` plus the
// header element to anchor against. Storing the element ref directly
// keeps `useFloatingPosition` honest even if the schema briefly drops
// the property mid-edit (the popover closes naturally on next render).
interface PropertyPopoverTarget {
    definitionId: string;
    triggerEl: HTMLElement | null;
}

const iconPickerTarget = ref<PropertyPopoverTarget | null>(null);

const iconPickerProperty = computed<PropertyDefinition | null>(() => {
    const target = iconPickerTarget.value;
    if (!target) return null;
    return props.schema.find((p) => p.id === target.definitionId) ?? null;
});

const iconPickerAnchor = computed<HTMLElement | null>(() => {
    const target = iconPickerTarget.value;
    if (!target) return null;
    return target.triggerEl ?? headerRefs.value[target.definitionId] ?? null;
});

const headerMenuProperty = computed<PropertyDefinition | null>(() => {
    const state = headerMenu.value;
    if (!state) return null;
    return props.schema.find((property) => property.id === state.definitionId) ?? null;
});

const deletePropertyMessage = computed(() => {
    const def = deletePropertyTarget.value;
    return def
        ? `Delete property "${def.label}"? This removes the column and its values from every row.`
        : '';
});

function openHeaderMenu(definitionId: string, event: MouseEvent): void {
    if (!props.editable) return;
    event.preventDefault();
    const triggerEl = event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : headerRefs.value[definitionId] ?? null;
    headerMenu.value = {
        definitionId,
        x: event.clientX,
        y: event.clientY,
        triggerEl,
    };
}

function closeHeaderMenu(): void {
    headerMenu.value = null;
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

function requestReplaceProperty(def: PropertyDefinition): void {
    if (!props.editable) return;
    closeHeaderMenu();
    replacePropertyTarget.value = def;
}

function requestChangeIcon(def: PropertyDefinition): void {
    if (!props.editable) return;
    const triggerEl = headerMenu.value?.triggerEl ?? headerRefs.value[def.id] ?? null;
    closeHeaderMenu();
    iconPickerTarget.value = { definitionId: def.id, triggerEl };
}

async function onIconPicked(icon: string | null): Promise<void> {
    const def = iconPickerProperty.value;
    if (!def) return;
    iconPickerTarget.value = null;
    if ((def.icon ?? null) === icon) return;
    await api.properties.update(def.id, { icon });
    publishDatabaseSchemaChanged(props.database.id);
    emit('schema-changed');
}

function onReplacePropertyModelValue(open: boolean): void {
    if (!open) replacePropertyTarget.value = null;
}

function onPropertyReplaced(updatedProperty: PropertyDefinition): void {
    const previousProperty = replacePropertyTarget.value;
    replacePropertyTarget.value = null;
    publishDatabaseSchemaChanged(props.database.id);
    if (previousProperty && previousProperty.type !== updatedProperty.type) {
        emit('view-config-changed', {
            filter: withoutPropertyFilter(props.activeView.config.filter, previousProperty),
            sort: canSortProperty(updatedProperty)
                ? props.activeView.config.sort
                : withoutPropertySort(props.activeView.config.sort, previousProperty),
        });
    }
    emit('schema-changed');
}

async function confirmDeleteProperty(): Promise<void> {
    const def = deletePropertyTarget.value;
    deletePropertyTarget.value = null;
    if (!def) return;
    await api.properties.remove(def.id);
    publishDatabaseSchemaChanged(props.database.id);
    emit('schema-changed');
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

</script>

<template>
    <div
        class="db-table"
        :class="{
            'db-table--no-vlines': !showVerticalLines,
            'db-table--wrap': common.wrapContent,
        }"
        role="table"
        :style="{ gridTemplateColumns: gridTemplate }"
        @contextmenu="onRootContextMenu">
        <div class="db-table__head" role="row">
            <div class="db-table__cell db-table__cell--title db-table__cell--header" role="columnheader">
                <Icon name="prop-text" :size="12" />
                <span>Name</span>
                <button
                    v-if="editable"
                    type="button"
                    class="db-table__resize-handle"
                    title="Resize column"
                    aria-label="Resize Name column"
                    @pointerdown="startColumnResize(TITLE_COLUMN_KEY, $event, TITLE_COLUMN_MIN)" />
            </div>
            <div
                v-for="property in visibleSchema"
                :key="property.id"
                :ref="(el) => setHeaderRef(property.id, el)"
                class="db-table__cell db-table__cell--header"
                :class="{
                    'is-column-dragging': isColumnDragging(property.key),
                    'is-column-drop-before': isColumnDropTarget(property.key, 'before'),
                    'is-column-drop-after': isColumnDropTarget(property.key, 'after'),
                }"
                role="columnheader"
                :draggable="editable && visibleSchema.length > 1 && renameDraftId !== property.id"
                v-on="columnDragHandlers(property)">
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
                    <Icon
                        v-if="editable && visibleSchema.length > 1"
                        name="drag"
                        :size="12"
                        class="db-table__col-drag" />
                    <Icon :name="propertyIcon(property)" :size="12" />
                    <button
                        type="button"
                        class="db-table__col-trigger"
                        :title="editable ? 'Click to rename — right-click for more' : property.label"
                        @click="startRename(property)"
                        @contextmenu.stop="openHeaderMenu(property.id, $event)">
                        {{ property.label }}
                    </button>
                </template>
                <button
                    v-if="editable"
                    type="button"
                    class="db-table__resize-handle"
                    title="Resize column"
                    :aria-label="`Resize ${property.label} column`"
                    @pointerdown="startColumnResize(property.key, $event, PROPERTY_COLUMN_MIN)" />
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

        <div v-for="row in rows" :key="row.rowId" class="db-table__row" role="row" :style="rowStyleFor(row)" @contextmenu.stop="openRowMenu(row, $event)">
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
                role="cell"
                :style="cellStyleFor(row, property.key)">
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

        <div v-if="draftRowVisible" class="db-table__row db-table__row--draft" role="row">
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

        <div v-if="editable" class="db-table__footer" role="row">
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

        <AddPropertyModal
            v-if="editable && replacePropertyTarget"
            :model-value="!!replacePropertyTarget"
            owner="database"
            :database-id="database.id"
            :database-properties="schema"
            :replace-property="replacePropertyTarget"
            @update:model-value="onReplacePropertyModelValue"
            @updated="onPropertyReplaced" />

        <DatabasePropertyHeaderMenu
            v-if="editable && activeView"
            :model-value="headerMenu !== null"
            :x="headerMenu?.x ?? 0"
            :y="headerMenu?.y ?? 0"
            :property="headerMenuProperty"
            :view="activeView"
            @update:model-value="(value) => { if (!value) closeHeaderMenu(); }"
            @rename="startRename"
            @replace="requestReplaceProperty"
            @change-icon="requestChangeIcon"
            @delete="requestDeleteProperty"
            @patch-config="(patch) => emit('view-config-changed', patch)" />

        <PropertyIconPicker
            v-if="editable && iconPickerProperty && iconPickerAnchor"
            :model-value="iconPickerTarget !== null"
            :trigger-el="iconPickerAnchor"
            :type="iconPickerProperty.type"
            :icon="iconPickerProperty.icon ?? null"
            @update:model-value="(value) => { if (!value) iconPickerTarget = null; }"
            @pick="onIconPicked" />

        <DatabaseRowMenu
            :model-value="rowMenu !== null"
            :x="rowMenu?.x ?? 0"
            :y="rowMenu?.y ?? 0"
            @update:model-value="(value) => { if (!value) closeRowMenu(); }"
            @open="openRowFromMenu"
            @delete="requestDeleteRow" />
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
    /*
     * One grid for the whole spreadsheet so header, body rows and
     * footer share the SAME column track sizing. Each row sets
     * `grid-template-columns: subgrid` and spans the full row
     * (`grid-column: 1 / -1`) so its cells inherit the parent's
     * column widths instead of being sized independently — that
     * was misaligning headers from cells when row content (progress
     * bars, file chips, multi-select tags) was wider than the header
     * label and expanded `1fr` tracks only inside the row.
     */
    display: grid;
    grid-auto-rows: min-content;
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
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
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

.db-table__cell--header[draggable='true'] {
    cursor: grab;
}

.db-table__cell--header[draggable='true']:active {
    cursor: grabbing;
}

.db-table__cell--header.is-column-dragging {
    opacity: 0.48;
}

.db-table__cell--header.is-column-drop-before::before,
.db-table__cell--header.is-column-drop-after::after {
    content: '';
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 999px;
    background: var(--accent);
    pointer-events: none;
    z-index: 4;
}

.db-table__cell--header.is-column-drop-before::before {
    left: -1px;
}

.db-table__cell--header.is-column-drop-after::after {
    right: -1px;
}

.db-table__resize-handle {
    position: absolute;
    top: 0;
    right: -4px;
    bottom: 0;
    width: 8px;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: col-resize;
    z-index: 3;
}

.db-table__resize-handle::after {
    content: '';
    position: absolute;
    top: 20%;
    bottom: 20%;
    left: 3px;
    width: 2px;
    border-radius: 999px;
    background: transparent;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-table__resize-handle:hover::after,
.db-table__resize-handle:focus-visible::after {
    background: var(--accent);
}

.db-table__cell--title {
    font-weight: var(--font-weight-medium);
    color: inherit;
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

.db-table__col-drag {
    flex: 0 0 auto;
    color: var(--text-muted);
    opacity: 0.72;
}

.db-table__cell--header:hover .db-table__col-drag,
.db-table__cell--header.is-column-dragging .db-table__col-drag {
    color: var(--text-primary);
    opacity: 1;
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
