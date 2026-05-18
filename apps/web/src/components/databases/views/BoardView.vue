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
 * Columns are derived from a `select` or `status` property. The
 * property id is persisted on `activeView.config.layout.groupByPropertyId`.
 * If unset, the renderer auto-selects the first matching schema entry
 * and emits `view-config-changed` so the choice is saved.
 *
 * When no select/status property exists, the renderer surfaces a
 * tasteful empty-state pointing the user at the property modal.
 *
 * Cards
 * ─────
 * Each card shows the row title plus up to three visible properties.
 * Clicking the card opens the underlying note. Moving a card to another
 * column updates the row's property value through `api.properties.setValue`
 * and emits `cell-saved` so the parent reloads the snapshot.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
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
    PropertyValue,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();

const router = useRouter();

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

const groupByProperty = computed<PropertyDefinition | null>(() => {
    const layout = (props.activeView.config.layout ?? {}) as Record<string, unknown>;
    const explicitId = typeof layout.groupByPropertyId === 'string'
        ? layout.groupByPropertyId
        : null;
    if (explicitId) {
        const def = props.schema.find((p) => p.id === explicitId);
        if (def && (def.type === 'select' || def.type === 'status')) return def;
    }
    return props.schema.find((p) => p.type === 'select' || p.type === 'status') ?? null;
});

/**
 * The first time the renderer mounts without an explicit selection but
 * auto-resolved one, persist the choice so the saved view stays stable.
 */
const layoutMissingExplicit = computed(() => {
    const layout = (props.activeView.config.layout ?? {}) as Record<string, unknown>;
    return typeof layout.groupByPropertyId !== 'string';
});

if (groupByProperty.value && layoutMissingExplicit.value) {
    emit('view-config-changed', {
        layout: {
            ...(props.activeView.config.layout ?? {}),
            groupByPropertyId: groupByProperty.value.id,
        },
    });
}

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
        const value = entry?.value;
        // `SelectValue` / `StatusValue` store the option *id* (not its label),
        // so bucketing is a direct id lookup.
        let key = noneKey;
        if (value && (value.type === 'select' || value.type === 'status')) {
            if (buckets.has(value.value)) key = value.value;
        }
        const bucket = buckets.get(key);
        if (bucket) bucket.push(row);
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
    void router.push({ path: '/', query: { note: row.noteId } });
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
        const value = (def.type === 'status'
            ? { type: 'status', value: columnKey }
            : { type: 'select', value: columnKey }) as PropertyValue;
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
    <div class="db-board">
        <div v-if="!groupByProperty" class="db-board__empty">
            <Icon name="view-board" :size="28" />
            <h4>Board needs a select or status property</h4>
            <p>
                Add a property of type <strong>Select</strong> or <strong>Status</strong> in any
                table view — this Board view will group rows by its options automatically.
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
                        <strong class="db-board__card-title">{{ row.note.title || 'Untitled' }}</strong>
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
    gap: 0.6rem;
    align-items: flex-start;
}

.db-board__col {
    min-width: 240px;
    max-width: 280px;
    flex: 0 0 auto;
    background: var(--bg-soft, #1c1c1c);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    display: flex;
    flex-direction: column;
}

.db-board__col-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.7rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-board__col-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}

.db-board__col-label {
    flex: 1;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--fg, #ededed);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.db-board__col-count {
    font-size: 0.72rem;
    color: var(--fg-muted, #a09b90);
}

.db-board__cards {
    list-style: none;
    margin: 0;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-height: 80px;
}

.db-board__card {
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: 6px;
    padding: 0.55rem 0.65rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    transition: border-color 80ms ease, transform 80ms ease;
}

.db-board__card:hover {
    border-color: var(--accent, #e8dcc8);
}

.db-board__card[draggable='true']:active {
    transform: scale(0.99);
}

.db-board__card--empty {
    background: transparent;
    border-style: dashed;
    cursor: default;
    color: var(--fg-muted, #a09b90);
    font-size: 0.75rem;
    text-align: center;
}

.db-board__card-title {
    color: var(--fg, #ededed);
    font-size: 0.85rem;
    line-height: 1.2;
}

.db-board__card-line {
    margin: 0;
    font-size: 0.72rem;
    color: var(--fg-muted, #a09b90);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-board__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    padding: 2.5rem 1.5rem;
    text-align: center;
    color: var(--fg-muted, #a09b90);
}

.db-board__empty h4 {
    margin: 0;
    color: var(--fg, #ededed);
    font-size: 0.95rem;
}

.db-board__empty p {
    margin: 0;
    max-width: 44ch;
    font-size: 0.8rem;
}
</style>
