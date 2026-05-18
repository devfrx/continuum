<script setup lang="ts">
/**
 * TimelineView.vue — horizontal Gantt-style bar renderer.
 *
 * Each row becomes a bar laid out along a monthly date axis. Rows
 * carrying a `dateRange` value span the full from→to interval; rows
 * with a single `date` (or system timestamp) render as a one-day bar
 * pinned on that day. Rows missing the property are collected in a
 * collapsible "Unscheduled" footer so they remain reachable without
 * polluting the timeline.
 *
 * Configuration (`activeView.config.layout`)
 *   – `datePropertyId`  `date` / `dateRange` / system-timestamp property
 *
 * The viewport defaults to the current month and can be paged with
 * the < / > buttons or jumped to "Today". The view follows the same
 * Monday-start week convention as `CalendarView` to stay consistent
 * with the rest of the date UI in the app.
 */
import { computed, ref, watch } from 'vue';
import { Icon } from '@/components/ui';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyValue,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);

// ── Configuration ────────────────────────────────────────────────────────

const TIMELINE_TYPES = ['date', 'dateRange', 'createdTime', 'lastEditedTime'] as const;

function isTimelineable(def: PropertyDefinition): boolean {
    return (TIMELINE_TYPES as readonly string[]).includes(def.type);
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
        if (def && isTimelineable(def)) return def;
    }
    return (
        props.schema.find((p) => p.type === 'dateRange')
        ?? props.schema.find((p) => p.type === 'date')
        ?? null
    );
});

watch(
    dateProperty,
    (property) => {
        if (!property || explicitDatePropertyId.value === property.id) return;
        emit('view-config-changed', { layout: { datePropertyId: property.id } });
    },
    { immediate: true },
);

// ── Viewport / axis ──────────────────────────────────────────────────────

const cursor = ref(new Date());

function shiftMonth(delta: number): void {
    const next = new Date(cursor.value);
    next.setDate(1);
    next.setMonth(next.getMonth() + delta);
    cursor.value = next;
}

function goToday(): void {
    cursor.value = new Date();
}

const monthLabel = computed(() =>
    cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
);

interface AxisDay {
    /** 1-based day number rendered in the header. */
    day: number;
    /** ISO `YYYY-MM-DD` used by bar math. */
    iso: string;
    isToday: boolean;
}

const axis = computed<AxisDay[]>(() => {
    const year = cursor.value.getFullYear();
    const month = cursor.value.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayIso = toIso(new Date());
    const out: AxisDay[] = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
        const date = new Date(year, month, d);
        const iso = toIso(date);
        out.push({ day: d, iso, isToday: iso === todayIso });
    }
    return out;
});

function toIso(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ── Bar math ─────────────────────────────────────────────────────────────

interface TimelineBar {
    row: DatabaseRowSnapshot;
    /** Inclusive 1-based start day in the current month. */
    startDay: number;
    /** Inclusive 1-based end day in the current month. */
    endDay: number;
    /** Bar spans days before the viewport's first column. */
    clippedLeft: boolean;
    /** Bar spans days after the viewport's last column. */
    clippedRight: boolean;
}

/** Read the [start, end] timestamps a row covers, or `null` when unscheduled. */
function rangeOf(value: PropertyValue | undefined | null): { from: number; to: number } | null {
    if (!value) return null;
    if (value.type === 'date' || value.type === 'createdTime' || value.type === 'lastEditedTime') {
        const t = Date.parse(value.value);
        if (!Number.isFinite(t)) return null;
        return { from: t, to: t };
    }
    if (value.type === 'dateRange') {
        const from = Date.parse(value.value.from);
        const to = Date.parse(value.value.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
        return { from: Math.min(from, to), to: Math.max(from, to) };
    }
    return null;
}

interface Partition {
    bars: TimelineBar[];
    unscheduled: DatabaseRowSnapshot[];
}

const partition = computed<Partition>(() => {
    const def = dateProperty.value;
    const bars: TimelineBar[] = [];
    const unscheduled: DatabaseRowSnapshot[] = [];
    if (!def) return { bars, unscheduled: [...props.rows] };
    const year = cursor.value.getFullYear();
    const month = cursor.value.getMonth();
    const monthStart = new Date(year, month, 1).getTime();
    const monthEnd = new Date(year, month + 1, 0).getTime();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (const row of props.rows) {
        const entry = row.properties.find((p) => p.definition.id === def.id);
        const range = rangeOf(entry?.value);
        if (!range) { unscheduled.push(row); continue; }
        // Drop rows entirely outside the visible month.
        if (range.to < monthStart || range.from > monthEnd) continue;
        const startDate = new Date(Math.max(range.from, monthStart));
        const endDate = new Date(Math.min(range.to, monthEnd));
        bars.push({
            row,
            startDay: Math.max(1, startDate.getDate()),
            endDay: Math.min(daysInMonth, endDate.getDate()),
            clippedLeft: range.from < monthStart,
            clippedRight: range.to > monthEnd,
        });
    }
    bars.sort((a, b) => a.startDay - b.startDay);
    return { bars, unscheduled };
});

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}

/** Inline grid-column-style for a bar based on the current month axis. */
function barStyle(bar: TimelineBar): Record<string, string> {
    return {
        gridColumnStart: String(bar.startDay),
        gridColumnEnd: String(bar.endDay + 1),
    };
}
</script>

<template>
    <div class="db-timeline" :class="{ 'db-timeline--wrap': common.wrapContent }">
        <header class="db-timeline__head">
            <button type="button" class="db-timeline__nav" @click="shiftMonth(-1)" aria-label="Previous month">
                <Icon name="chevron-left" :size="14" />
            </button>
            <strong class="db-timeline__label">{{ monthLabel }}</strong>
            <button type="button" class="db-timeline__nav" @click="shiftMonth(1)" aria-label="Next month">
                <Icon name="chevron-right" :size="14" />
            </button>
            <button type="button" class="db-timeline__today" @click="goToday">Today</button>
            <span v-if="!dateProperty" class="db-timeline__hint">
                Add a <strong>Date</strong> or <strong>Date range</strong> property to plot rows.
            </span>
        </header>

        <div class="db-timeline__scroll">
            <div class="db-timeline__axis" :style="{ gridTemplateColumns: `repeat(${axis.length}, minmax(28px, 1fr))` }">
                <span
                    v-for="day in axis"
                    :key="day.iso"
                    class="db-timeline__axis-cell"
                    :class="{ 'db-timeline__axis-cell--today': day.isToday }">
                    {{ day.day }}
                </span>
            </div>
            <ol class="db-timeline__rows" :style="{ gridTemplateColumns: `repeat(${axis.length}, minmax(28px, 1fr))` }">
                <li
                    v-for="bar in partition.bars"
                    :key="bar.row.rowId"
                    class="db-timeline__bar"
                    :class="{
                        'db-timeline__bar--clipped-l': bar.clippedLeft,
                        'db-timeline__bar--clipped-r': bar.clippedRight,
                    }"
                    :style="barStyle(bar)"
                    @click="openRow(bar.row)">
                    <Icon
                        v-if="common.showPageIcon"
                        :name="iconOf(bar.row.note.kind)"
                        :size="11"
                        class="db-timeline__bar-icon"
                        :style="{ color: colorOf(bar.row.note.kind) }" />
                    <span class="db-timeline__bar-title">{{ bar.row.note.title || 'Untitled' }}</span>
                </li>
                <li v-if="!partition.bars.length && dateProperty" class="db-timeline__empty">
                    No rows fall in {{ monthLabel }}.
                </li>
            </ol>
        </div>

        <footer v-if="partition.unscheduled.length" class="db-timeline__foot">
            <span class="db-timeline__foot-label">Unscheduled · {{ partition.unscheduled.length }}</span>
            <button
                v-for="row in partition.unscheduled"
                :key="row.rowId"
                type="button"
                class="db-timeline__badge"
                @click="openRow(row)">
                <Icon
                    v-if="common.showPageIcon"
                    :name="iconOf(row.note.kind)"
                    :size="11"
                    :style="{ color: colorOf(row.note.kind) }" />
                {{ row.note.title || 'Untitled' }}
            </button>
        </footer>
    </div>
</template>

<style scoped>
.db-timeline {
    display: flex;
    flex-direction: column;
    color: var(--fg, #ededed);
    font-size: 0.78rem;
    min-height: 0;
}

.db-timeline__head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-timeline__nav,
.db-timeline__today {
    border: none;
    background: transparent;
    color: var(--fg-muted, #a09b90);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    font: inherit;
}

.db-timeline__nav:hover,
.db-timeline__today:hover {
    color: var(--fg, #ededed);
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
}

.db-timeline__label {
    margin: 0 0.25rem;
    font-size: 0.9rem;
}

.db-timeline__hint {
    margin-left: auto;
    color: var(--fg-muted, #a09b90);
}

.db-timeline__scroll {
    overflow-x: auto;
    padding: 0.4rem 0.75rem 0.6rem;
}

.db-timeline__axis,
.db-timeline__rows {
    display: grid;
    min-width: 760px;
}

.db-timeline__axis-cell {
    padding: 0.3rem 0;
    text-align: center;
    color: var(--fg-muted, #a09b90);
    font-size: 0.7rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-timeline__axis-cell--today {
    color: var(--accent, #e8dcc8);
    font-weight: 600;
}

.db-timeline__rows {
    list-style: none;
    padding: 0.4rem 0;
    margin: 0;
    grid-auto-rows: 1.65rem;
    grid-auto-flow: row;
    row-gap: 0.3rem;
}

.db-timeline__bar {
    background: var(--accent, #e8dcc8);
    color: #1a1a1a;
    border-radius: var(--radius-sm);
    padding: 0 0.45rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    overflow: hidden;
    cursor: pointer;
    font-size: 0.74rem;
    line-height: 1;
    transition: filter 80ms ease;
    min-width: 0;
}

.db-timeline__bar:hover {
    filter: brightness(1.08);
}

.db-timeline__bar--clipped-l { border-top-left-radius: var(--radius-sm); border-bottom-left-radius: var(--radius-sm); }
.db-timeline__bar--clipped-r { border-top-right-radius: var(--radius-sm); border-bottom-right-radius: var(--radius-sm); }

.db-timeline__bar-icon {
    flex: 0 0 auto;
}

.db-timeline__bar-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-timeline--wrap .db-timeline__bar-title {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    word-break: break-word;
}

.db-timeline__empty {
    grid-column: 1 / -1;
    padding: 1.2rem 0;
    text-align: center;
    color: var(--fg-muted, #a09b90);
    list-style: none;
}

.db-timeline__foot {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem 0.75rem;
    border-top: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-timeline__foot-label {
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 0.3rem;
}

.db-timeline__badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.08));
    color: var(--fg, #ededed);
    border-radius: var(--radius-sm);
    padding: 0.2rem 0.55rem;
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
}

.db-timeline__badge:hover {
    border-color: var(--accent, #e8dcc8);
}
</style>
