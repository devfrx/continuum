<script setup lang="ts">
/**
 * CalendarLayout — month grid driven by a `date` / `dateRange` property.
 *
 * Local state owns the visible month; navigation chevrons mutate it and
 * emit `range-change(from,to)` so the page can refetch with a tighter
 * filter when desired. `view.layout.startOnMonday` flips weekday order;
 * `showWeekends=false` hides Sat/Sun columns.
 */
import { computed, ref, watch } from 'vue';
import type {
  DatabaseView,
  NoteWithProperties,
  QueryGroupBucket,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import { extractDate, findPropertyValue } from '../_shared/propertyHelpers';
import CalendarDay from './CalendarDay.vue';

const props = defineProps<{
  view: DatabaseView | null;
  rows: NoteWithProperties[];
  groups: QueryGroupBucket[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reloadRow: (noteId: string) => Promise<void>;
}>();

const emit = defineEmits<{
  (e: 'open', noteId: string): void;
  (e: 'range-change', from: Date, to: Date): void;
}>();

const dateKey = computed<string>(() =>
  props.view?.layout.type === 'calendar' ? props.view.layout.datePropertyKey : '',
);
const startOnMonday = computed<boolean>(() =>
  props.view?.layout.type === 'calendar' ? props.view.layout.startOnMonday : true,
);
const showWeekends = computed<boolean>(() =>
  props.view?.layout.type === 'calendar' ? props.view.layout.showWeekends : true,
);

// Visible month anchor (always day 1).
const cursor = ref<Date>(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const monthLabel = computed(() =>
  cursor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
);

const weekdayOrder = computed<number[]>(() =>
  startOnMonday.value
    ? [1, 2, 3, 4, 5, 6, 0]
    : [0, 1, 2, 3, 4, 5, 6],
);

const visibleWeekdays = computed<number[]>(() =>
  showWeekends.value
    ? weekdayOrder.value
    : weekdayOrder.value.filter((d) => d !== 0 && d !== 6),
);

const weekdayLabels = computed<string[]>(() => {
  const ref0 = new Date(2024, 0, 7); // Sunday
  return visibleWeekdays.value.map((d) => {
    const day = new Date(ref0);
    day.setDate(ref0.getDate() + d);
    return day.toLocaleDateString(undefined, { weekday: 'short' });
  });
});

interface Cell { date: Date; inMonth: boolean }

const grid = computed<Cell[]>(() => {
  const first = new Date(cursor.value);
  const startDow = first.getDay();
  const offset = weekdayOrder.value.indexOf(startDow);
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (showWeekends.value || (d.getDay() !== 0 && d.getDay() !== 6)) {
      cells.push({ date: d, inMonth: d.getMonth() === cursor.value.getMonth() });
    }
  }
  return cells;
});

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const eventsByDay = computed<Map<string, NoteWithProperties[]>>(() => {
  const map = new Map<string, NoteWithProperties[]>();
  if (!dateKey.value) return map;
  for (const row of props.rows) {
    const { from, to } = extractDate(findPropertyValue(row, dateKey.value));
    if (!from) continue;
    const end = to ?? from;
    const cursor2 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (cursor2 <= end) {
      const k = isoDay(cursor2);
      const list = map.get(k) ?? [];
      list.push(row);
      map.set(k, list);
      cursor2.setDate(cursor2.getDate() + 1);
    }
  }
  return map;
});

function shift(months: number): void {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + months, 1);
}

watch(cursor, (v) => {
  const from = new Date(v);
  const to = new Date(v.getFullYear(), v.getMonth() + 1, 0);
  emit('range-change', from, to);
}, { immediate: true });
</script>

<template>
  <div class="cal-layout">
    <header class="cal-layout__header">
      <button type="button" class="cal-layout__nav" @click="shift(-1)" aria-label="Previous month">
        <Icon name="chevron-left" />
      </button>
      <span class="cal-layout__title">{{ monthLabel }}</span>
      <button type="button" class="cal-layout__nav" @click="shift(1)" aria-label="Next month">
        <Icon name="chevron-right" />
      </button>
    </header>
    <div class="cal-layout__weekdays" :style="{ gridTemplateColumns: `repeat(${visibleWeekdays.length}, 1fr)` }">
      <span v-for="w in weekdayLabels" :key="w" class="cal-layout__weekday">{{ w }}</span>
    </div>
    <div class="cal-layout__grid" :style="{ gridTemplateColumns: `repeat(${visibleWeekdays.length}, 1fr)` }">
      <CalendarDay
        v-for="cell in grid"
        :key="isoDay(cell.date)"
        :date="cell.date"
        :in-month="cell.inMonth"
        :events="eventsByDay.get(isoDay(cell.date)) ?? []"
        @open="emit('open', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.cal-layout { display: flex; flex-direction: column; height: 100%; }
.cal-layout__header {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; padding: 8px; border-bottom: var(--border-width-1) solid var(--border);
}
.cal-layout__nav {
  background: transparent; border: none; cursor: pointer; color: var(--text-muted);
  padding: 4px; border-radius: 4px; display: inline-flex;
}
.cal-layout__nav:hover { background: var(--bg-soft); color: var(--text); }
.cal-layout__title { font-weight: 600; color: var(--text); min-width: 180px; text-align: center; }
.cal-layout__weekdays {
  display: grid; padding: 6px 0;
  border-bottom: var(--border-width-1) solid var(--border);
}
.cal-layout__weekday {
  text-align: center; font-size: 11px; color: var(--text-muted); text-transform: uppercase;
}
.cal-layout__grid {
  flex: 1; display: grid; overflow-y: auto;
  border-top: var(--border-width-1) solid var(--border);
  border-left: var(--border-width-1) solid var(--border);
}
</style>
