<script setup lang="ts">
/**
 * CalendarView.vue — month-grid renderer.
 *
 * Layout
 * ──────
 *   ┌─────────────────────────────────────────────────────────┐
 *   │           <  June 2026  >                  Today         │
 *   ├───────┬───────┬───────┬───────┬───────┬───────┬─────────┤
 *   │ Mon   │ Tue   │ Wed   │ Thu   │ Fri   │ Sat   │ Sun     │
 *   ├───────┼───────┼───────┼───────┼───────┼───────┼─────────┤
 *   │  1    │  2    │  3    │  4    │  5    │  6    │  7      │
 *   │ [evt] │       │       │ [evt] │       │       │ [evt]   │
 *   └───────┴───────┴───────┴───────┴───────┴───────┴─────────┘
 *
 * The renderer reads `activeView.config.layout.datePropertyId` to pick
 * the property that determines a row's calendar slot. When unset, the
 * first `date` or `dateRange` property in the schema is used and the
 * choice is persisted via `view-config-changed`.
 *
 * The week starts on Monday — ISO-style — matching the Italian /
 * European convention shipped elsewhere in the app (see
 * `UiDatePicker`).
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@/components/ui';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const router = useRouter();

// ── Configuration: date property ─────────────────────────────────────────

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const dateProperty = computed<PropertyDefinition | null>(() => {
    const explicit = typeof layout.value.datePropertyId === 'string'
        ? layout.value.datePropertyId
        : null;
    if (explicit) {
        const def = props.schema.find((p) => p.id === explicit);
        if (def && (def.type === 'date' || def.type === 'dateRange')) return def;
    }
    return props.schema.find((p) => p.type === 'date' || p.type === 'dateRange') ?? null;
});

if (dateProperty.value && typeof layout.value.datePropertyId !== 'string') {
    emit('view-config-changed', {
        layout: { ...layout.value, datePropertyId: dateProperty.value.id },
    });
}

// ── Month navigation ─────────────────────────────────────────────────────

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

// ── Calendar grid ────────────────────────────────────────────────────────

interface DayCell {
    /** ISO `YYYY-MM-DD` for stable bucketing. */
    iso: string;
    date: Date;
    inMonth: boolean;
    isToday: boolean;
    rows: DatabaseRowSnapshot[];
}

const WEEKDAY_LABELS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toIso(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

const rowsByDay = computed<Map<string, DatabaseRowSnapshot[]>>(() => {
    const map = new Map<string, DatabaseRowSnapshot[]>();
    const def = dateProperty.value;
    if (!def) return map;
    for (const row of props.rows) {
        const entry = row.properties.find((p) => p.definition.id === def.id);
        const value = entry?.value;
        if (!value) continue;
        if (value.type === 'date') {
            // ISO 8601 — slice the `YYYY-MM-DD` head; safe for both date
            // and datetime granularities.
            const iso = value.value.slice(0, 10);
            const bucket = map.get(iso) ?? [];
            bucket.push(row);
            map.set(iso, bucket);
        } else if (value.type === 'dateRange') {
            // Place the row on every day inside the range. The range is
            // typically short (event windows) so the expansion stays cheap.
            const from = new Date(value.value.from);
            const to = new Date(value.value.to);
            const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
            const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
            // Safety bound — capping at 60 days prevents pathological
            // ranges from blowing up the map. Real events stay well below.
            let guard = 0;
            while (day.getTime() <= end.getTime() && guard < 60) {
                const iso = toIso(day);
                const bucket = map.get(iso) ?? [];
                bucket.push(row);
                map.set(iso, bucket);
                day.setDate(day.getDate() + 1);
                guard += 1;
            }
        }
    }
    return map;
});

const grid = computed<DayCell[]>(() => {
    const year = cursor.value.getFullYear();
    const month = cursor.value.getMonth();
    const first = new Date(year, month, 1);
    // ISO weekday: 1 = Mon … 7 = Sun. Shift so Monday is column 0.
    const firstWeekday = (first.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - firstWeekday);
    const cells: DayCell[] = [];
    const today = new Date();
    const lookup = rowsByDay.value;
    for (let i = 0; i < 42; i += 1) {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + i);
        const iso = toIso(date);
        cells.push({
            iso,
            date,
            inMonth: date.getMonth() === month,
            isToday: isSameDay(date, today),
            rows: lookup.get(iso) ?? [],
        });
    }
    return cells;
});

function openRow(row: DatabaseRowSnapshot): void {
    void router.push({ path: '/', query: { note: row.noteId } });
}
</script>

<template>
    <div class="db-cal">
        <header class="db-cal__head">
            <button type="button" class="db-cal__nav" @click="shiftMonth(-1)" aria-label="Previous month">
                <Icon name="chevron-left" :size="14" />
            </button>
            <strong class="db-cal__label">{{ monthLabel }}</strong>
            <button type="button" class="db-cal__nav" @click="shiftMonth(1)" aria-label="Next month">
                <Icon name="chevron-right" :size="14" />
            </button>
            <button type="button" class="db-cal__today" @click="goToday">Today</button>
            <span v-if="!dateProperty" class="db-cal__hint">
                Add a <strong>Date</strong> property to schedule rows.
            </span>
        </header>
        <div class="db-cal__weekdays">
            <span v-for="d in WEEKDAY_LABELS" :key="d">{{ d }}</span>
        </div>
        <div class="db-cal__grid">
            <div
                v-for="cell in grid"
                :key="cell.iso"
                class="db-cal__cell"
                :class="{
                    'db-cal__cell--muted': !cell.inMonth,
                    'db-cal__cell--today': cell.isToday,
                }">
                <span class="db-cal__day">{{ cell.date.getDate() }}</span>
                <ul class="db-cal__events">
                    <li
                        v-for="row in cell.rows"
                        :key="`${cell.iso}-${row.rowId}`"
                        class="db-cal__event"
                        @click="openRow(row)">
                        {{ row.note.title || 'Untitled' }}
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
.db-cal {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--fg, #ededed);
    font-size: 0.78rem;
}

.db-cal__head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.75rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-cal__nav,
.db-cal__today {
    border: none;
    background: transparent;
    color: var(--fg-muted, #a09b90);
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font: inherit;
}

.db-cal__nav:hover,
.db-cal__today:hover {
    color: var(--fg, #ededed);
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
}

.db-cal__label {
    margin: 0 0.25rem;
    font-size: 0.9rem;
}

.db-cal__hint {
    margin-left: auto;
    color: var(--fg-muted, #a09b90);
}

.db-cal__weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-cal__weekdays span {
    padding: 0.35rem 0.5rem;
    font-size: 0.7rem;
    color: var(--fg-muted, #a09b90);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.db-cal__grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-auto-rows: minmax(86px, 1fr);
}

.db-cal__cell {
    border-right: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.04));
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.04));
    padding: 0.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    background: var(--bg-elev, #232323);
}

.db-cal__cell--muted {
    background: var(--bg-soft, #1c1c1c);
    color: var(--fg-muted, #a09b90);
}

.db-cal__cell--today .db-cal__day {
    color: var(--accent, #e8dcc8);
    font-weight: 600;
}

.db-cal__day {
    font-size: 0.72rem;
    color: var(--fg-muted, #a09b90);
}

.db-cal__events {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
}

.db-cal__event {
    padding: 2px 4px;
    background: var(--surface-soft, rgba(255, 255, 255, 0.04));
    border-left: 3px solid var(--accent, #e8dcc8);
    border-radius: 3px;
    font-size: 0.7rem;
    color: var(--fg, #ededed);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-cal__event:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.08));
}
</style>
