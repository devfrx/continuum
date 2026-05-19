<script setup lang="ts">
/**
 * TimelineView.vue — interactive monthly Gantt renderer.
 *
 * Composition
 * ───────────
 *  – `useTimelineGeometry` measures the axis container and exposes the
 *    px↔day conversions used by every interaction.
 *  – `useTimelineInteractions` owns the pointer state machine for
 *    moving bars, resizing them from either edge, and dropping new
 *    rows from the unscheduled tray.
 *  – `timelineSchedule` builds the property-value payloads that get
 *    persisted through `api.properties.setValue` / `clearValue`.
 *  – `TimelineAxis` paints the day grid + scroll container, exposing
 *    its DOM element back via `@register` so the geometry composable
 *    can attach a `ResizeObserver` to it.
 *  – `TimelineBar` is the per-row pill with grab body + edge handles.
 *  – `TimelineUnscheduledTray` lists rows without a date and turns
 *    them into pointer-drag sources.
 *  – `TimelineBarContextMenu` reuses `UiContextMenu` for the right-
 *    click menu (Open / Unschedule / Delete).
 *
 * Read-only fallbacks
 * ───────────────────
 *  – Rows scheduled from `createdTime` / `lastEditedTime` render
 *    without grab/resize affordances (the underlying property can't
 *    be written from the client).
 *  – `date`-typed properties only allow body-drag (single-day move);
 *    resize handles are hidden because resizing would require flipping
 *    the schema to `dateRange`.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@/components/ui';
import { api } from '@/api';
import {
    publishDatabaseRowsChanged,
    publishPropertyValueChanged,
} from '@/lib/realtime';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from '../types';
import { useDatabaseRowDisplay } from '../../useDatabaseRowDisplay';
import { useConditionalColors } from '../../conditionalColor';
import {
    isTimelineDateProperty,
    rangeForRow,
    rangeOfPropertyValue,
} from '../dateRows';
import TimelineAxis, { type AxisDay } from './TimelineAxis.vue';
import TimelineBar from './TimelineBar.vue';
import TimelineUnscheduledTray from './TimelineUnscheduledTray.vue';
import TimelineBarContextMenu from './TimelineBarContextMenu.vue';
import { useTimelineGeometry } from './useTimelineGeometry';
import {
    useTimelineInteractions,
    type CommitPayload,
} from './useTimelineInteractions';
import {
    buildSchedulePayload,
    isReadOnlyDateType,
    toIsoDate,
} from './timelineSchedule';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);
const { rowStyleFor } = useConditionalColors({
    activeView: computed(() => props.activeView),
    schema: computed(() => props.schema),
});

// ── Configuration ────────────────────────────────────────────────────────

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const explicitDatePropertyId = computed<string | null>(() =>
    typeof layout.value.datePropertyId === 'string' ? layout.value.datePropertyId : null,
);

const dateProperties = computed<PropertyDefinition[]>(() =>
    props.schema.filter(isTimelineDateProperty),
);

const dateProperty = computed<PropertyDefinition | null>(() => {
    const explicit = explicitDatePropertyId.value;
    if (explicit) {
        const def = props.schema.find((p) => p.id === explicit);
        if (def && isTimelineDateProperty(def)) return def;
    }
    return (
        dateProperties.value.find((p) => p.type === 'dateRange')
        ?? dateProperties.value.find((p) => p.type === 'date')
        ?? dateProperties.value.find((p) => p.type === 'lastEditedTime')
        ?? dateProperties.value.find((p) => p.type === 'createdTime')
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

const daysInMonth = computed(() => {
    const year = cursor.value.getFullYear();
    const month = cursor.value.getMonth();
    return new Date(year, month + 1, 0).getDate();
});

const axis = computed<AxisDay[]>(() => {
    const year = cursor.value.getFullYear();
    const month = cursor.value.getMonth();
    const todayIso = toIsoDate(new Date());
    const out: AxisDay[] = [];
    for (let d = 1; d <= daysInMonth.value; d += 1) {
        const date = new Date(year, month, d);
        const iso = toIsoDate(date);
        const dow = date.getDay();
        out.push({ day: d, iso, isToday: iso === todayIso, isWeekend: dow === 0 || dow === 6 });
    }
    return out;
});

// ── Bar partitioning ─────────────────────────────────────────────────────

interface PlannedBar {
    row: DatabaseRowSnapshot;
    /** The property that produced this bar's range (drives writes). */
    sourceProperty: PropertyDefinition;
    /** Inclusive 1-based day in the current month. */
    startDay: number;
    /** Inclusive 1-based day in the current month. */
    endDay: number;
    clippedLeft: boolean;
    clippedRight: boolean;
    lane: number;
}

/** Greedy lane assignment so overlapping bars stack vertically. */
function assignLanes(bars: Omit<PlannedBar, 'lane'>[]): PlannedBar[] {
    const lanes: number[] = []; // lanes[i] = last occupied endDay
    const sorted = [...bars].sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay);
    const out: PlannedBar[] = [];
    for (const bar of sorted) {
        let assigned = -1;
        for (let i = 0; i < lanes.length; i += 1) {
            if ((lanes[i] ?? 0) < bar.startDay) {
                assigned = i;
                break;
            }
        }
        if (assigned === -1) {
            assigned = lanes.length;
            lanes.push(0);
        }
        lanes[assigned] = bar.endDay;
        out.push({ ...bar, lane: assigned });
    }
    return out;
}

interface Partition {
    bars: PlannedBar[];
    unscheduled: DatabaseRowSnapshot[];
    laneCount: number;
}

/** Identify which property produced the row's range (for writes). */
function sourcePropertyOf(
    row: DatabaseRowSnapshot,
    candidates: PropertyDefinition[],
    preferred: PropertyDefinition | null,
): PropertyDefinition | null {
    if (preferred) {
        const entry = row.properties.find((p) => p.definition.id === preferred.id);
        const range = rangeOfPropertyValue(entry?.value);
        if (range) return preferred;
        if (preferred.type === 'createdTime' || preferred.type === 'lastEditedTime') {
            return preferred; // system timestamps always have a value
        }
    }
    for (const def of candidates) {
        if (def.id === preferred?.id) continue;
        const entry = row.properties.find((p) => p.definition.id === def.id);
        const range = rangeOfPropertyValue(entry?.value);
        if (range) return def;
        if (def.type === 'createdTime' || def.type === 'lastEditedTime') return def;
    }
    return null;
}

const partition = computed<Partition>(() => {
    const def = dateProperty.value;
    const candidates = dateProperties.value;
    const planned: Omit<PlannedBar, 'lane'>[] = [];
    const unscheduled: DatabaseRowSnapshot[] = [];
    if (!candidates.length) return { bars: [], unscheduled: [...props.rows], laneCount: 0 };
    const year = cursor.value.getFullYear();
    const month = cursor.value.getMonth();
    const monthStart = new Date(year, month, 1).getTime();
    const monthEnd = new Date(year, month + 1, 0).getTime();
    for (const row of props.rows) {
        const range = rangeForRow(row, candidates, def);
        if (!range) { unscheduled.push(row); continue; }
        if (range.to < monthStart || range.from > monthEnd) continue;
        const source = sourcePropertyOf(row, candidates, def);
        if (!source) { unscheduled.push(row); continue; }
        const startDate = new Date(Math.max(range.from, monthStart));
        const endDate = new Date(Math.min(range.to, monthEnd));
        planned.push({
            row,
            sourceProperty: source,
            startDay: Math.max(1, startDate.getDate()),
            endDay: Math.min(daysInMonth.value, endDate.getDate()),
            clippedLeft: range.from < monthStart,
            clippedRight: range.to > monthEnd,
        });
    }
    const bars = assignLanes(planned);
    const laneCount = bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
    return { bars, unscheduled, laneCount };
});

// ── Geometry + interactions ──────────────────────────────────────────────

const axisEl = ref<HTMLElement | null>(null);
const geometry = useTimelineGeometry(axisEl, daysInMonth);

const LANE_HEIGHT = 28; // bar height + gap
const BAR_HEIGHT = 22;
const MIN_LANES = 4;

const bodyHeightPx = computed(() => Math.max(MIN_LANES, partition.value.laneCount) * LANE_HEIGHT + 12);

function dayToPx(day1Based: number): number {
    return (day1Based - 1) * geometry.pxPerDay.value;
}

function laneTop(lane: number): number {
    return 6 + lane * LANE_HEIGHT;
}

function isEditableProperty(def: PropertyDefinition | null): boolean {
    if (!def) return false;
    if (isReadOnlyDateType(def.type)) return false;
    return def.type === 'date' || def.type === 'dateRange';
}

function isResizable(def: PropertyDefinition | null): boolean {
    return def?.type === 'dateRange';
}

const interactions = useTimelineInteractions({
    daysFromPx: geometry.daysFromPx,
    dayAtClientPoint: geometry.dayAtClientPoint,
    daysInMonth: () => daysInMonth.value,
    onCommit: (payload) => { void commit(payload); },
});

// Track per-row source property for the active gesture (move/resize use
// the bar's source property; drop-new uses the active dateProperty).
const gestureSourceByRow = new Map<string, PropertyDefinition>();

function rememberSource(rowId: string, def: PropertyDefinition): void {
    gestureSourceByRow.set(rowId, def);
}

function dateForDay(day: number): Date {
    return new Date(cursor.value.getFullYear(), cursor.value.getMonth(), day);
}

async function commit(payload: CommitPayload): Promise<void> {
    const writable = payload.mode === 'drop-new'
        ? dateProperty.value
        : gestureSourceByRow.get(payload.row.rowId) ?? dateProperty.value;
    gestureSourceByRow.delete(payload.row.rowId);
    if (!writable || !isEditableProperty(writable)) return;
    if (payload.outsideAxis) return;

    const fromDate = dateForDay(payload.startDay);
    const toDate = dateForDay(payload.endDay);
    const value = buildSchedulePayload(writable.type, fromDate, toDate);
    if (!value) return;

    try {
        await api.properties.setValue(payload.row.noteId, writable.id, value);
        publishPropertyValueChanged(payload.row.noteId, writable.id);
        publishDatabaseRowsChanged(props.database.id, { rowNoteId: payload.row.noteId });
        emit('cell-saved');
    } catch (err) {
        // Leave the bar where it was on failure — the next refresh will
        // re-render the stored range.
        console.error('[timeline] failed to persist range', err);
    }
}

function onBarBodyDown(event: PointerEvent, bar: PlannedBar): void {
    if (!props.editable || !isEditableProperty(bar.sourceProperty)) return;
    rememberSource(bar.row.rowId, bar.sourceProperty);
    interactions.beginMove(event, bar.row, bar.startDay, bar.endDay);
}

function onBarResizeDown(event: PointerEvent, bar: PlannedBar, side: 'left' | 'right'): void {
    if (!props.editable || !isResizable(bar.sourceProperty)) return;
    rememberSource(bar.row.rowId, bar.sourceProperty);
    interactions.beginResize(event, bar.row, bar.startDay, bar.endDay, side);
}

function onTrayPointerDown(event: PointerEvent, row: DatabaseRowSnapshot): void {
    if (!props.editable || !isEditableProperty(dateProperty.value)) return;
    interactions.beginDropFromTray(event, row);
}

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}

// ── Context menu ─────────────────────────────────────────────────────────

interface ContextMenuState {
    rowId: string;
    sourceProperty: PropertyDefinition;
    x: number;
    y: number;
}

const ctxMenu = ref<ContextMenuState | null>(null);

function openContextMenu(event: MouseEvent, bar: PlannedBar): void {
    event.preventDefault();
    event.stopPropagation();
    ctxMenu.value = {
        rowId: bar.row.rowId,
        sourceProperty: bar.sourceProperty,
        x: event.clientX,
        y: event.clientY,
    };
}

const ctxMenuRow = computed<DatabaseRowSnapshot | null>(() => {
    const state = ctxMenu.value;
    if (!state) return null;
    return props.rows.find((r) => r.rowId === state.rowId) ?? null;
});

const ctxMenuReadOnly = computed<boolean>(() => {
    const state = ctxMenu.value;
    if (!state) return true;
    return !isEditableProperty(state.sourceProperty);
});

async function onUnschedule(): Promise<void> {
    const state = ctxMenu.value;
    const row = ctxMenuRow.value;
    ctxMenu.value = null;
    if (!state || !row || !isEditableProperty(state.sourceProperty)) return;
    try {
        await api.properties.clearValue(row.noteId, state.sourceProperty.id);
        publishPropertyValueChanged(row.noteId, state.sourceProperty.id);
        publishDatabaseRowsChanged(props.database.id, { rowNoteId: row.noteId });
        emit('cell-saved');
    } catch (err) {
        console.error('[timeline] failed to unschedule', err);
    }
}

function onDelete(): void {
    const row = ctxMenuRow.value;
    ctxMenu.value = null;
    if (!row) return;
    emit('remove-row', row.rowId);
}

function onContextOpen(): void {
    const row = ctxMenuRow.value;
    ctxMenu.value = null;
    if (row) openRow(row);
}

// ── Ghost preview helpers ───────────────────────────────────────────────

function previewBarOf(bar: PlannedBar): { startDay: number; endDay: number } | null {
    const g = interactions.gesture.value;
    if (!g || g.rowId !== bar.row.rowId) return null;
    if (g.mode === 'drop-new') return null;
    if (g.previewStartDay < 1) return null;
    return { startDay: g.previewStartDay, endDay: g.previewEndDay };
}

const dropGhost = computed(() => {
    const g = interactions.gesture.value;
    if (!g || g.mode !== 'drop-new') return null;
    if (g.previewStartDay < 1) return null;
    return {
        title: g.row.note.title || 'Untitled',
        startDay: g.previewStartDay,
        endDay: g.previewEndDay,
    };
});

// Reset cached gesture source when active view changes (avoid stale data).
watch(() => props.activeView.id, () => {
    gestureSourceByRow.clear();
    interactions.cancel();
    ctxMenu.value = null;
});

// Force a re-measure when the axis count changes (month nav, schema swap).
watch(daysInMonth, async () => {
    await nextTick();
});
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

        <TimelineAxis :days="axis" :body-height-px="bodyHeightPx" @register="(el) => (axisEl = el)">
            <template v-if="!partition.bars.length && dateProperty">
                <p class="db-timeline__empty">No rows fall in {{ monthLabel }}.</p>
            </template>

            <TimelineBar v-for="bar in partition.bars" :key="bar.row.rowId" :title="bar.row.note.title"
                :icon="common.showPageIcon ? iconOf(bar.row.note.kind) : undefined"
                :icon-color="colorOf(bar.row.note.kind)" :left-px="dayToPx(previewBarOf(bar)?.startDay ?? bar.startDay)"
                :width-px="((previewBarOf(bar)?.endDay ?? bar.endDay) - (previewBarOf(bar)?.startDay ?? bar.startDay) + 1) * geometry.pxPerDay.value"
                :top-px="laneTop(bar.lane)" :height-px="BAR_HEIGHT" :clipped-left="bar.clippedLeft"
                :clipped-right="bar.clippedRight" :editable="editable && isEditableProperty(bar.sourceProperty)"
                :resizable="isResizable(bar.sourceProperty)" :ghost="!!previewBarOf(bar)"
                :row-style="rowStyleFor(bar.row)" :show-icon="common.showPageIcon"
                @pointerdown-body="(e) => onBarBodyDown(e, bar)"
                @pointerdown-left="(e) => onBarResizeDown(e, bar, 'left')"
                @pointerdown-right="(e) => onBarResizeDown(e, bar, 'right')"
                @open="openRow(bar.row)"
                @contextmenu="(e) => openContextMenu(e, bar)" />

            <div v-if="dropGhost" class="db-timeline__drop-ghost" :style="{
                left: `${dayToPx(dropGhost.startDay)}px`,
                width: `${(dropGhost.endDay - dropGhost.startDay + 1) * geometry.pxPerDay.value}px`,
                top: `${laneTop(0)}px`,
                height: `${BAR_HEIGHT}px`,
            }">
                <span class="db-timeline__drop-ghost-title">{{ dropGhost.title }}</span>
            </div>
        </TimelineAxis>

        <TimelineUnscheduledTray :rows="partition.unscheduled" :icon-of="iconOf" :color-of="colorOf"
            :show-icon="common.showPageIcon" :editable="editable && isEditableProperty(dateProperty)"
            :row-style-for="rowStyleFor" @pointerdown-badge="onTrayPointerDown" @open="openRow" />

        <TimelineBarContextMenu v-if="ctxMenu" :model-value="!!ctxMenu" :x="ctxMenu.x" :y="ctxMenu.y"
            :read-only="ctxMenuReadOnly" @update:model-value="(v) => { if (!v) ctxMenu = null; }"
            @open="onContextOpen" @unschedule="onUnschedule" @delete="onDelete" />
    </div>
</template>

<style scoped>
.db-timeline {
    display: flex;
    flex-direction: column;
    color: var(--fg, #ededed);
    font-size: 0.78rem;
    min-height: 0;
    flex: 1 1 auto;
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

.db-timeline__empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--fg-muted, #a09b90);
    margin: 0;
}

.db-timeline__drop-ghost {
    position: absolute;
    display: flex;
    align-items: center;
    padding: 0 0.55rem;
    background: color-mix(in srgb, var(--surface-4, #323232) 88%, transparent);
    border: var(--border-width-1, 1px) solid var(--border-hover, rgba(255, 255, 255, 0.10));
    outline: var(--border-width-1, 1px) dashed var(--fg-muted, #a09b90);
    outline-offset: 2px;
    border-radius: var(--radius-xs, 4px);
    pointer-events: none;
    color: var(--fg, #ededed);
    font-size: 0.72rem;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.22));
}

.db-timeline__drop-ghost-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
