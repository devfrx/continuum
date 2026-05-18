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
import { computed, watch } from 'vue';
import { Icon } from '@/components/ui';
import { api } from '@/api';
import {
    publishDatabaseRowsChanged,
    publishPropertyValueChanged,
} from '@/lib/realtime';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyOption,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';
import {
    isBoardGroupable,
    readSelectedOptionIds,
    nextValueOnDrop,
} from './boardGrouping';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);

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

function rowSummary(row: DatabaseRowSnapshot): string[] {
    const parts: string[] = [];
    for (const entry of row.properties.slice(0, 5)) {
        if (entry.definition.id === groupByProperty.value?.id) continue;
        const value = entry.value;
        if (!value) continue;
        if (value.type === 'text' || value.type === 'longText') parts.push(value.value);
        else if (value.type === 'number') parts.push(String(value.value));
        else if (value.type === 'checkbox') parts.push(value.value ? '✓' : '✗');
        else if (value.type === 'date') parts.push(value.value);
        else if (value.type === 'dateRange') parts.push(`${value.value.from} → ${value.value.to}`);
        else if (value.type === 'select' || value.type === 'status') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            const opt = cfg.options?.find((o) => o.id === value.value);
            parts.push(opt?.label ?? value.value);
        }
        else if (value.type === 'multiSelect') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            const labels = value.value.map((id) => cfg.options?.find((o) => o.id === id)?.label ?? id);
            parts.push(labels.join(', '));
        }
        else if (value.type === 'url' || value.type === 'email' || value.type === 'phone') {
            parts.push(value.value);
        }
        if (parts.length >= 3) break;
    }
    return parts;
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

function onCardDragStart(event: DragEvent, row: DatabaseRowSnapshot): void {
    if (!props.editable) return;
    event.dataTransfer?.setData('text/plain', row.rowId);
    event.dataTransfer!.effectAllowed = 'move';
}

function onColumnDragOver(event: DragEvent): void {
    if (!props.editable) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
}

async function onColumnDrop(event: DragEvent, columnKey: string): Promise<void> {
    if (!props.editable) return;
    event.preventDefault();
    const rowId = event.dataTransfer?.getData('text/plain');
    if (!rowId) return;
    const row = props.rows.find((r) => r.rowId === rowId);
    if (!row) return;
    await moveTo(row, columnKey);
}
</script>

<template>
    <div class="db-board" :class="{ 'db-board--wrap': common.wrapContent }">
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
                @dragover="onColumnDragOver"
                @drop="(e) => onColumnDrop(e, column.key)">
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
                        :draggable="editable"
                        @dragstart="(e) => onCardDragStart(e, row)"
                        @click="openRow(row)">
                        <div class="db-board__card-title-row">
                            <Icon
                                v-if="common.showPageIcon"
                                :name="iconOf(row.note.kind)"
                                :size="13"
                                class="db-board__card-icon"
                                :style="{ color: colorOf(row.note.kind) }" />
                            <strong class="db-board__card-title">{{ row.note.title || 'Untitled' }}</strong>
                        </div>
                        <p
                            v-for="(line, i) in rowSummary(row)"
                            :key="i"
                            class="db-board__card-line">
                            {{ line }}
                        </p>
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
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.db-board__card:hover {
    border-color: var(--border-strong);
    background: var(--surface-hover);
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
}

.db-board__card-title {
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    line-height: var(--leading-tight);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-board__card-line {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-board--wrap .db-board__card-title,
.db-board--wrap .db-board__card-line {
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
</style>
