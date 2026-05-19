<script setup lang="ts">
/**
 * FeedView.vue — reverse-chronological stream renderer.
 *
 * Notion-style "Updates / Activity" surface that renders rows as
 * stacked cards sorted by a date-bearing property. The default
 * heuristic prefers the row's `lastEditedTime` system property when
 * present, then `createdTime`, then the first user-defined `date` /
 * `dateRange` property.
 *
 * Configuration (`activeView.config.layout`)
 *   – `datePropertyId`  property used to sort the feed
 *   – `direction`       `'desc'` (newest first, default) | `'asc'`
 *
 * Each card mirrors the Gallery layout cell renderer: title row with an
 * optional kind icon, a small grey timestamp, and the first three
 * non-date property values rendered as plain strings.
 */
import { computed, watch } from 'vue';
import { Icon } from '@/components/ui';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyValue,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';
import { useConditionalColors } from '../conditionalColor';
import { resolveCardProperties } from './cardProperties';
import DatabaseCardProperty from './DatabaseCardProperty.vue';
import { useDatabaseRowReorder } from './useDatabaseRowReorder';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);
const { rowStyleFor, cellStyleFor } = useConditionalColors({
    activeView: computed(() => props.activeView),
    schema: computed(() => props.schema),
});

// ── Configuration ────────────────────────────────────────────────────────

const FEED_TYPES = ['date', 'dateRange', 'createdTime', 'lastEditedTime'] as const;

function isFeedable(def: PropertyDefinition): boolean {
    return (FEED_TYPES as readonly string[]).includes(def.type);
}

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const explicitDatePropertyId = computed<string | null>(() =>
    typeof layout.value.datePropertyId === 'string' ? layout.value.datePropertyId : null,
);

const dateProperty = computed<PropertyDefinition | null>(() => {
    const explicit = explicitDatePropertyId.value;
    if (explicit) {
        const def = props.schema.find((p) => p.id === explicit);
        if (def && isFeedable(def)) return def;
    }
    // Prefer system timestamps if present, then user dates.
    return (
        props.schema.find((p) => p.type === 'lastEditedTime')
        ?? props.schema.find((p) => p.type === 'createdTime')
        ?? props.schema.find((p) => p.type === 'date' || p.type === 'dateRange')
        ?? null
    );
});

const direction = computed<'asc' | 'desc'>(() =>
    layout.value.direction === 'asc' ? 'asc' : 'desc',
);

const manualOrder = computed(() => layout.value.manualOrder === true);

watch(
    dateProperty,
    (property) => {
        if (!property || explicitDatePropertyId.value === property.id) return;
        emit('view-config-changed', {
            layout: { datePropertyId: property.id },
        });
    },
    { immediate: true },
);

// ── Sorting ──────────────────────────────────────────────────────────────

/** Pull a comparable timestamp (ms since epoch) out of a property value. */
function timestampOf(value: PropertyValue | undefined | null): number {
    if (!value) return Number.NEGATIVE_INFINITY;
    if (value.type === 'date' || value.type === 'createdTime' || value.type === 'lastEditedTime') {
        const t = Date.parse(value.value);
        return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
    }
    if (value.type === 'dateRange') {
        const t = Date.parse(value.value.from);
        return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
    }
    return Number.NEGATIVE_INFINITY;
}

const sortedRows = computed<DatabaseRowSnapshot[]>(() => {
    if (manualOrder.value) return [...props.rows];
    const def = dateProperty.value;
    if (!def) return [...props.rows];
    const sign = direction.value === 'asc' ? 1 : -1;
    return [...props.rows].sort((a, b) => {
        const av = a.properties.find((p) => p.definition.id === def.id)?.value;
        const bv = b.properties.find((p) => p.definition.id === def.id)?.value;
        return sign * (timestampOf(av) - timestampOf(bv));
    });
});

const {
    orderedRows,
    isDraggingRow,
    isDropTargetRow,
    rowSourceHandlers,
    rowTargetHandlers,
    listTargetHandlers,
} = useDatabaseRowReorder({
    databaseId: computed(() => props.database.id),
    rows: sortedRows,
    editable: computed(() => props.editable),
    onReordered: () => {
        emit('view-config-changed', { layout: { manualOrder: true } });
        emit('cell-saved');
    },
});

// ── Card rendering helpers ──────────────────────────────────────────────

function formatTimestamp(value: PropertyValue | undefined | null): string {
    const t = timestampOf(value);
    if (!Number.isFinite(t) || t === Number.NEGATIVE_INFINITY) return '';
    return new Date(t).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function timestampFor(row: DatabaseRowSnapshot): string {
    const def = dateProperty.value;
    if (!def) return '';
    return formatTimestamp(row.properties.find((p) => p.definition.id === def.id)?.value);
}

function detailProperties(): PropertyDefinition[] {
    const skip = new Set<string>();
    if (dateProperty.value) skip.add(dateProperty.value.key);
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

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}
</script>

<template>
    <div class="db-feed" :class="{ 'db-feed--wrap': common.wrapContent }">
        <div v-if="!orderedRows.length" class="db-feed__empty">
            <Icon name="view-feed" :size="22" />
            <p>No rows yet — add the first one from the toolbar to see it appear here.</p>
        </div>
        <ol v-else class="db-feed__list" v-on="listTargetHandlers">
            <li
                v-for="row in orderedRows"
                :key="row.rowId"
                data-row-drop-target="true"
                class="db-feed__entry"
                :class="{
                    'is-dragging': isDraggingRow(row.rowId),
                    'is-drop-target': isDropTargetRow(row.rowId),
                }"
                :draggable="editable"
                :style="rowStyleFor(row)"
                v-on="{ ...rowSourceHandlers(row), ...rowTargetHandlers(row) }"
                @click="openRow(row)">
                <div class="db-feed__head">
                    <Icon
                        v-if="common.showPageIcon"
                        :name="iconOf(row.note.kind)"
                        :size="14"
                        class="db-feed__icon"
                        :style="{ color: colorOf(row.note.kind) }" />
                    <strong class="db-feed__title">{{ row.note.title || 'Untitled' }}</strong>
                    <span v-if="timestampFor(row)" class="db-feed__time">{{ timestampFor(row) }}</span>
                </div>
                <div v-if="detailProperties().length" class="db-feed__props">
                    <DatabaseCardProperty
                        v-for="def in detailProperties()"
                        v-show="hasEntry(row, def)"
                        :key="def.id"
                        :row="row"
                        :property="def"
                        :cell-style="cellStyleFor(row, def.key)" />
                </div>
            </li>
        </ol>
    </div>
</template>

<style scoped>
.db-feed {
    padding: 0.6rem 0.8rem;
}

.db-feed__list {
    list-style: none;
    margin: 0 auto;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(100%, 960px);
}

.db-feed__entry {
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
}

.db-feed__entry:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.15));
}

.db-feed__entry[draggable='true'] {
    cursor: grab;
}

.db-feed__entry[draggable='true']:active {
    cursor: grabbing;
}

.db-feed__entry.is-dragging {
    opacity: 0.55;
}

.db-feed__entry.is-drop-target {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
}

.db-feed__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.db-feed__icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.db-feed__title {
    flex: 1;
    color: inherit;
    font-size: var(--text-md);
    font-weight: var(--font-weight-semibold);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.db-feed__time {
    color: var(--text-muted);
    font-size: var(--text-xs);
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
}

.db-feed__props {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: var(--space-1);
    border-top: var(--border-width-1) dashed var(--border);
}

.db-feed--wrap .db-feed__title {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    word-break: break-word;
}

.db-feed__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    max-width: 960px;
    margin: 0 auto;
    color: var(--text-muted);
    padding: var(--space-10, 40px) var(--space-5);
    text-align: center;
}
</style>
