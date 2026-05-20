<script setup lang="ts">
/**
 * BoardView.vue — Notion-style kanban renderer.
 *
 * Layout
 * ──────
 *   ┌────────────┬────────────┬────────────┐
 *   │  TO DO     │ IN PROGRESS│   DONE     │   ← columns = option values
 *   ├────────────┼────────────┼────────────┤
 *   │ [card]     │ [card]     │ [card]     │
 *   │ [card]     │            │            │
 *   └────────────┴────────────┴────────────┘
 *
 * Grouping
 * ────────
 * Columns are derived from a `select`, `multiSelect` or `status`
 * property. The property id is persisted on
 * `activeView.config.layout.groupByPropertyId`. If unset, the renderer
 * auto-selects the first matching schema entry and emits
 * `view-config-changed` so the choice is saved.
 *
 * Multi-select rows appear in *every* column whose option id is
 * present in their value, mirroring Notion semantics. Dropping a card
 * onto another column adds that option without disturbing the others;
 * dropping it onto the special "No value" column clears the value
 * entirely. See `boardGrouping.ts` for the value-encoding rules.
 *
 * When no option-based property exists, the renderer surfaces a
 * tasteful empty-state pointing the user at the property modal.
 *
 * Cards
 * ─────
 * Each card shows the row title plus up to three visible properties.
 * Clicking the card opens the underlying note. Moving a card to another
 * column updates the row's property value through `api.properties.setValue`
 * and emits `cell-saved` so the parent reloads the snapshot.
 */
import { computed, ref, watch, type Ref } from 'vue';
import { Icon } from '@/components/ui';
import { api } from '@/api';
import {
    publishDatabaseRowsChanged,
    publishPropertyValueChanged,
} from '@/lib/realtime';
import { coverBackgroundPosition } from '@/lib/noteCover';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyOption,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';
import { useConditionalColors } from '../conditionalColor';
import { readCardDisplay } from '../layout';
import { resolveCardProperties } from './cardProperties';
import DatabaseCardProperty from './DatabaseCardProperty.vue';
import {
    isBoardGroupable,
    readSelectedOptionIds,
    nextValueOnDrop,
} from './boardGrouping';
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
const { rowStyleFor, cellStyleFor } = useConditionalColors({
    activeView: computed(() => props.activeView),
    schema: computed(() => props.schema),
});

/**
 * Card display knobs (preview / size / layout / colour columns) shared
 * with the Gallery layout. Reads defensively from `config.layout` so
 * unknown values fall back to the documented defaults.
 */
const cardDisplay = computed(() => readCardDisplay(props.activeView.config.layout));

const boardClasses = computed(() => ({
    'db-board--wrap': common.value.wrapContent,
    [`db-board--size-${cardDisplay.value.cardSize}`]: true,
    [`db-board--layout-${cardDisplay.value.cardLayout}`]: true,
    'db-board--color-cols': cardDisplay.value.colorColumns,
    [`db-board--preview-${cardDisplay.value.cardPreview}`]: true,
}));

/**
 * Translate the configured `cardPreview` into a row-derived cover URL.
 * Returns `null` whenever no media should be painted at the top of the
 * card (preview = `none` / `properties`, or no usable image found).
 */
function cardCoverUrl(row: DatabaseRowSnapshot): string | null {
    const mode = cardDisplay.value.cardPreview;
    if (mode === 'none' || mode === 'properties') return null;
    if (mode === 'pageCover') return row.note?.coverImage ?? null;
    // pageContent: Board snapshots don't ship a body excerpt — fall back
    // to a cover image when present so the user still gets a preview
    // surface; degrade to no media otherwise.
    return row.note?.coverImage ?? null;
}

function cardCoverStyle(row: DatabaseRowSnapshot): Record<string, string> {
    const url = cardCoverUrl(row);
    if (!url) return {};
    return {
        backgroundImage: `url('${url}')`,
        backgroundPosition: coverBackgroundPosition(row.note.coverPosition),
    };
}

/**
 * Compute the soft column tint applied when `colorColumns` is on.
 * Uses a low-alpha overlay so the column stays readable against any
 * theme; the header dot keeps showing the saturated swatch.
 */
function columnStyle(column: BoardColumn): Record<string, string> {
    if (!cardDisplay.value.colorColumns || !column.color) return {};
    return {
        backgroundColor: `color-mix(in srgb, ${column.color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${column.color} 32%, transparent)`,
    };
}

// ── Group-by resolution ──────────────────────────────────────────────────

interface GroupOption {
    id: string;
    label: string;
    color: string | null;
}

interface BoardColumn {
    key: string;
    label: string;
    color: string | null;
    rows: DatabaseRowSnapshot[];
}

const explicitGroupByPropertyId = computed<string | null>(() => {
    const layout = (props.activeView.config.layout ?? {}) as Record<string, unknown>;
    return typeof layout.groupByPropertyId === 'string' ? layout.groupByPropertyId : null;
});

const groupByProperty = computed<PropertyDefinition | null>(() => {
    const explicitId = explicitGroupByPropertyId.value;
    if (explicitId) {
        const def = props.schema.find((p) => p.id === explicitId);
        if (def && isBoardGroupable(def)) return def;
    }
    return props.schema.find(isBoardGroupable) ?? null;
});

/**
 * The first time the renderer mounts without an explicit selection but
 * auto-resolved one, persist the choice so the saved view stays stable.
 */
const layoutNeedsPersist = computed(() => {
    const property = groupByProperty.value;
    return !!property && explicitGroupByPropertyId.value !== property.id;
});

watch(
    [groupByProperty, layoutNeedsPersist],
    ([property, needsPersist]) => {
        if (!property || !needsPersist) return;
        emit('view-config-changed', {
            layout: { groupByPropertyId: property.id },
        });
    },
    { immediate: true },
);

const groupOptions = computed<GroupOption[]>(() => {
    const def = groupByProperty.value;
    if (!def) return [];
    const cfg = (def.config ?? {}) as { options?: PropertyOption[] };
    return (cfg.options ?? []).map((opt) => ({
        id: opt.id,
        label: opt.label,
        color: opt.color ?? null,
    }));
});

const columns = computed<BoardColumn[]>(() => {
    const def = groupByProperty.value;
    if (!def) return [];
    const buckets = new Map<string, DatabaseRowSnapshot[]>();
    const noneKey = '__none__';
    buckets.set(noneKey, []);
    for (const opt of groupOptions.value) buckets.set(opt.id, []);
    for (const row of props.rows) {
        const entry = row.properties.find((p) => p.definition.id === def.id);
        const selected = readSelectedOptionIds(entry?.value);
        if (selected.length === 0) {
            buckets.get(noneKey)?.push(row);
            continue;
        }
        // Multi-select rows appear in every selected column. Single-value
        // selects/status only ever push to one bucket because `selected`
        // is guaranteed to be length 1.
        for (const id of selected) {
            const bucket = buckets.get(id);
            if (bucket) bucket.push(row);
        }
    }
    const out: BoardColumn[] = [];
    out.push({ key: noneKey, label: 'No value', color: null, rows: buckets.get(noneKey) ?? [] });
    for (const opt of groupOptions.value) {
        out.push({
            key: opt.id,
            label: opt.label,
            color: opt.color,
            rows: buckets.get(opt.id) ?? [],
        });
    }
    return out;
});

// ── Card actions ─────────────────────────────────────────────────────────

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}

/**
 * Visible card properties — honours the view's visibility config and
 * skips the group-by property (already conveyed by the column).
 * Hard-capped to keep cards skimmable; the Table view remains the
 * place for the full property surface.
 */
function cardProperties(): PropertyDefinition[] {
    const skip = new Set<string>();
    if (groupByProperty.value) skip.add(groupByProperty.value.key);
    return resolveCardProperties({
        schema: props.schema,
        view: props.activeView,
        skipKeys: skip,
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

async function moveTo(row: DatabaseRowSnapshot, columnKey: string): Promise<void> {
    if (!props.editable) return;
    const def = groupByProperty.value;
    if (!def) return;
    if (columnKey === '__none__') {
        await api.properties.clearValue(row.noteId, def.id);
    } else {
        const entry = row.properties.find((p) => p.definition.id === def.id);
        const value = nextValueOnDrop(def, entry?.value, columnKey);
        await api.properties.setValue(row.noteId, def.id, value);
    }
    publishPropertyValueChanged(row.noteId, def.id);
    publishDatabaseRowsChanged(props.database.id, { rowNoteId: row.noteId });
    emit('cell-saved');
}

// ── Drag-and-drop ────────────────────────────────────────────────────────
//
// Board cards expose a shared `application/x-continuum-card-id` MIME
// carrying their `rowId`. Each column installs a drop target that
// resolves the moved row by id and re-applies the saved property
// value through `moveTo`, mirroring Notion semantics for multi-select
// columns. Per-row source bindings + per-column target bindings are
// cached so the templates only pay one allocation per logical entity.

const BOARD_DRAG_KIND = 'database-board-card';

const draggedRowId = ref<string | null>(null);
const dropColumnKey = ref<string | null>(null);

const cardSources = new Map<string, { isDragging: Ref<boolean>; handlers: DragSourceHandlers }>();
const columnTargets = new Map<string, { isOver: Ref<boolean>; handlers: DropTargetHandlers }>();

function cardHandlers(row: DatabaseRowSnapshot): DragSourceHandlers {
    const cached = cardSources.get(row.rowId);
    if (cached) return cached.handlers;
    const source = useDragSource({
        mime: DRAG_MIME.cardId,
        kind: BOARD_DRAG_KIND,
        disabled: () => !props.editable,
        getPayload: () => row.rowId,
        onStart: () => {
            draggedRowId.value = row.rowId;
        },
        onEnd: () => {
            if (draggedRowId.value === row.rowId) draggedRowId.value = null;
            dropColumnKey.value = null;
        },
    });
    cardSources.set(row.rowId, { isDragging: source.isDragging, handlers: source.dragHandlers });
    return source.dragHandlers;
}

function columnHandlers(columnKey: string): DropTargetHandlers {
    const cached = columnTargets.get(columnKey);
    if (cached) return cached.handlers;
    const target = useDropTarget({
        accept: DRAG_MIME.cardId,
        acceptKind: BOARD_DRAG_KIND,
        disabled: () => !props.editable,
        autoscroll: { edge: 48 },
        onEnter: () => {
            dropColumnKey.value = columnKey;
        },
        onLeave: () => {
            if (dropColumnKey.value === columnKey) dropColumnKey.value = null;
        },
        onDrop: async (payload) => {
            dropColumnKey.value = null;
            const row = props.rows.find((r) => r.rowId === payload);
            if (!row) return;
            await moveTo(row, columnKey);
        },
    });
    columnTargets.set(columnKey, { isOver: target.isOver, handlers: target.dropHandlers });
    return target.dropHandlers;
}

function isColumnDropTarget(columnKey: string): boolean {
    if (dropColumnKey.value !== columnKey) return false;
    return draggedRowId.value !== null;
}

function isCardDragging(rowId: string): boolean {
    return draggedRowId.value === rowId;
}
</script>

<template>
    <div class="db-board" :class="boardClasses">
        <div v-if="!groupByProperty" class="db-board__empty">
            <Icon name="view-board" :size="28" />
            <h4>Board needs an option-based property</h4>
            <p>
                Add a property of type <strong>Select</strong>, <strong>Multi-select</strong> or
                <strong>Status</strong> in any table view — this Board view will group rows by
                its options automatically.
            </p>
        </div>
        <div v-else class="db-board__columns">
            <section
                v-for="column in columns"
                :key="column.key"
                class="db-board__col"
                :class="{ 'is-drop-target': isColumnDropTarget(column.key) }"
                :style="columnStyle(column)"
                v-on="columnHandlers(column.key)">
                <header class="db-board__col-head">
                    <span
                        class="db-board__col-dot"
                        :style="{ background: column.color ?? 'var(--fg-muted, #a09b90)' }" />
                    <span class="db-board__col-label">{{ column.label }}</span>
                    <span class="db-board__col-count">{{ column.rows.length }}</span>
                </header>
                <ul class="db-board__cards">
                    <li
                        v-for="row in column.rows"
                        :key="row.rowId"
                        class="db-board__card"
                        :class="{ 'is-dragging': isCardDragging(row.rowId) }"
                        :draggable="editable"
                        :style="rowStyleFor(row)"
                        v-on="cardHandlers(row)"
                        @click="openRow(row)">
                        <div
                            v-if="cardCoverUrl(row)"
                            class="db-board__card-cover"
                            :class="{ 'db-board__card-cover--fit': cardDisplay.fitMedia }"
                            :style="cardCoverStyle(row)" />
                        <div class="db-board__card-title-row">
                            <Icon
                                v-if="common.showPageIcon"
                                :name="iconOf(row.note.kind)"
                                :size="13"
                                class="db-board__card-icon"
                                :style="{ color: colorOf(row.note.kind) }" />
                            <strong class="db-board__card-title">{{ row.note.title || 'Untitled' }}</strong>
                        </div>
                        <div
                            v-if="cardDisplay.cardPreview !== 'none' && cardProperties().length"
                            class="db-board__card-props">
                            <DatabaseCardProperty
                                v-for="def in cardProperties()"
                                v-show="hasEntry(row, def)"
                                :key="def.id"
                                :row="row"
                                :property="def"
                                variant="stacked"
                                :cell-style="cellStyleFor(row, def.key)" />
                        </div>
                    </li>
                    <li v-if="!column.rows.length" class="db-board__card db-board__card--empty">
                        Drop a card here
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>

<style scoped>
.db-board {
    overflow-x: auto;
    padding: 0.5rem;
}

.db-board__columns {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
}

.db-board__col {
    min-width: 240px;
    max-width: 280px;
    flex: 0 0 auto;
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
}

.db-board__col.is-drop-target {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft, rgba(232, 220, 200, 0.18));
}

.db-board__card.is-dragging {
    opacity: 0.55;
    transform: scale(0.97);
}

.db-board__col-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
}

.db-board__col-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-sm);
    display: inline-block;
}

.db-board__col-label {
    flex: 1;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.db-board__col-count {
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-weight: var(--font-weight-medium);
}

.db-board__cards {
    list-style: none;
    margin: 0;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 80px;
}

.db-board__card {
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    color: var(--text-primary);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
}

.db-board__card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.15));
}

.db-board__card[draggable='true']:active {
    transform: scale(0.99);
}

.db-board__card-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.db-board__card-icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.db-board__card--empty {
    background: transparent;
    border-style: dashed;
    cursor: default;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-align: center;
    padding: var(--space-2) var(--space-3);
}

.db-board__card-title {
    color: inherit;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    line-height: var(--leading-tight);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-board__card-props {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: var(--space-1);
    border-top: var(--border-width-1) dashed var(--border);
}

.db-board--wrap .db-board__card-title {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    word-break: break-word;
}

.db-board__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-10, 40px) var(--space-5);
    text-align: center;
    color: var(--text-muted);
}

.db-board__empty h4 {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-md);
    font-weight: var(--font-weight-semibold);
}

.db-board__empty p {
    margin: 0;
    max-width: 44ch;
    font-size: var(--text-xs);
    color: var(--text-secondary);
}

/* ── Card preview cover ─────────────────────────────────────────── */
.db-board__card-cover {
    aspect-ratio: 16 / 9;
    margin: calc(var(--space-3) * -1) calc(var(--space-3) * -1) 0;
    background-color: var(--surface-3, rgba(0, 0, 0, 0.15));
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.db-board__card-cover--fit {
    background-size: contain;
}

/* ── Card size variants ─────────────────────────────────────────── */
.db-board--size-small .db-board__card {
    padding: calc(var(--space-2));
    gap: var(--space-1);
}

.db-board--size-small .db-board__card-cover {
    margin: calc(var(--space-2) * -1) calc(var(--space-2) * -1) 0;
    aspect-ratio: 21 / 9;
}

.db-board--size-small .db-board__card-title {
    font-size: var(--text-xs);
}

.db-board--size-large .db-board__card {
    padding: var(--space-4);
    gap: var(--space-3);
}

.db-board--size-large .db-board__card-cover {
    margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) 0;
    aspect-ratio: 4 / 3;
}

.db-board--size-large .db-board__card-title {
    font-size: var(--text-md);
}

/* ── List layout (wider, single-line cards) ─────────────────────── */
.db-board--layout-list .db-board__col {
    min-width: 320px;
    max-width: 380px;
}

.db-board--layout-list .db-board__card {
    flex-direction: row;
    align-items: center;
    gap: var(--space-3);
}

.db-board--layout-list .db-board__card-cover {
    margin: 0;
    flex: 0 0 64px;
    aspect-ratio: 1 / 1;
    border-radius: var(--radius-sm);
}

.db-board--layout-list .db-board__card-title-row,
.db-board--layout-list .db-board__card-props {
    flex: 1 1 auto;
    min-width: 0;
}

.db-board--layout-list .db-board__card-props {
    border-top: none;
    padding-top: 0;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-2);
}
</style>
