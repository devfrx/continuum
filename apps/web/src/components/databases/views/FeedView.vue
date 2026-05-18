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
    PropertyOption,
    PropertyValue,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);

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
    const def = dateProperty.value;
    if (!def) return [...props.rows];
    const sign = direction.value === 'asc' ? 1 : -1;
    return [...props.rows].sort((a, b) => {
        const av = a.properties.find((p) => p.definition.id === def.id)?.value;
        const bv = b.properties.find((p) => p.definition.id === def.id)?.value;
        return sign * (timestampOf(av) - timestampOf(bv));
    });
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

function detailLines(row: DatabaseRowSnapshot): string[] {
    const skip = new Set<string>();
    if (dateProperty.value) skip.add(dateProperty.value.id);
    const out: string[] = [];
    for (const entry of row.properties) {
        if (skip.has(entry.definition.id)) continue;
        const value = entry.value;
        if (!value) continue;
        if (value.type === 'text' || value.type === 'longText') out.push(value.value);
        else if (value.type === 'number') out.push(String(value.value));
        else if (value.type === 'checkbox') out.push(value.value ? '✓' : '✗');
        else if (value.type === 'select' || value.type === 'status') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            const opt = cfg.options?.find((o) => o.id === value.value);
            out.push(opt?.label ?? value.value);
        }
        else if (value.type === 'multiSelect') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            out.push(value.value.map((id) => cfg.options?.find((o) => o.id === id)?.label ?? id).join(', '));
        }
        else if (value.type === 'url' || value.type === 'email' || value.type === 'phone') out.push(value.value);
        if (out.length >= 3) break;
    }
    return out;
}

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}
</script>

<template>
    <div class="db-feed" :class="{ 'db-feed--wrap': common.wrapContent }">
        <div v-if="!sortedRows.length" class="db-feed__empty">
            <Icon name="view-feed" :size="22" />
            <p>No rows yet — add the first one from the toolbar to see it appear here.</p>
        </div>
        <ol v-else class="db-feed__list">
            <li
                v-for="row in sortedRows"
                :key="row.rowId"
                class="db-feed__entry"
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
                <p v-for="(line, i) in detailLines(row)" :key="i" class="db-feed__line">{{ line }}</p>
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
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-width: 780px;
}

.db-feed__entry {
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.db-feed__entry:hover {
    border-color: var(--border-strong);
    background: var(--surface-hover);
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
    color: var(--text-primary);
    font-size: var(--text-md);
    font-weight: var(--font-weight-medium);
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

.db-feed__line {
    margin: var(--space-1) 0 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-feed--wrap .db-feed__title,
.db-feed--wrap .db-feed__line {
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
    color: var(--text-muted);
    padding: var(--space-10, 40px) var(--space-5);
    text-align: center;
}
</style>
