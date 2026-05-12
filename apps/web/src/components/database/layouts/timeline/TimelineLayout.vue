<script setup lang="ts">
/**
 * TimelineLayout — horizontal Gantt-style canvas.
 *
 * X-axis quantum = `view.layout.granularity`. Bars span from
 * `startPropertyKey` to `endPropertyKey` (or `start + 1 unit` when no end
 * is configured). Lanes are assigned greedily to avoid overlap.
 *
 * Drag-to-move / drag-to-resize are skeleton stubs: only `range-change`
 * is exposed today; the parent decides what to do with it.
 */
import { computed } from 'vue';
import type {
  DatabaseView,
  NoteWithProperties,
  QueryGroupBucket,
  TimelineGranularity,
} from '@continuum/shared';
import { extractDate, findPropertyValue } from '../_shared/propertyHelpers';
import TimelineBar from './TimelineBar.vue';

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
  (e: 'range-change', noteId: string, start: Date, end: Date): void;
}>();

const startKey = computed<string>(() =>
  props.view?.layout.type === 'timeline' ? props.view.layout.startPropertyKey : '',
);
const endKey = computed<string | undefined>(() =>
  props.view?.layout.type === 'timeline' ? props.view.layout.endPropertyKey : undefined,
);
const granularity = computed<TimelineGranularity>(() =>
  props.view?.layout.type === 'timeline' ? props.view.layout.granularity : 'week',
);

const UNIT_MS: Record<TimelineGranularity, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  quarter: 91 * 86_400_000,
  year: 365 * 86_400_000,
};

interface Span { row: NoteWithProperties; start: Date; end: Date }

const spans = computed<Span[]>(() =>
  props.rows.flatMap((row) => {
    const { from } = extractDate(findPropertyValue(row, startKey.value));
    if (!from) return [];
    const endValue = endKey.value ? extractDate(findPropertyValue(row, endKey.value)) : null;
    const end = endValue?.from ?? new Date(from.getTime() + UNIT_MS[granularity.value]);
    return [{ row, start: from, end }];
  }),
);

interface Range { min: Date; max: Date }

const range = computed<Range | null>(() => {
  if (!spans.value.length) return null;
  let min = spans.value[0].start.getTime();
  let max = spans.value[0].end.getTime();
  for (const s of spans.value) {
    min = Math.min(min, s.start.getTime());
    max = Math.max(max, s.end.getTime());
  }
  // Pad either end by one unit so bars don't kiss the edges.
  const pad = UNIT_MS[granularity.value];
  return { min: new Date(min - pad), max: new Date(max + pad) };
});

interface Placed extends Span { lane: number; leftPct: number; widthPct: number }

const placed = computed<Placed[]>(() => {
  if (!range.value) return [];
  const total = range.value.max.getTime() - range.value.min.getTime();
  const sorted = [...spans.value].sort((a, b) => a.start.getTime() - b.start.getTime());
  const laneEnds: number[] = [];
  return sorted.map((s) => {
    let lane = laneEnds.findIndex((endTs) => endTs <= s.start.getTime());
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.end.getTime());
    } else {
      laneEnds[lane] = s.end.getTime();
    }
    const leftPct = ((s.start.getTime() - range.value!.min.getTime()) / total) * 100;
    const widthPct = ((s.end.getTime() - s.start.getTime()) / total) * 100;
    return { ...s, lane, leftPct, widthPct };
  });
});

const ticks = computed<{ leftPct: number; label: string }[]>(() => {
  if (!range.value) return [];
  const total = range.value.max.getTime() - range.value.min.getTime();
  const step = UNIT_MS[granularity.value];
  const out: { leftPct: number; label: string }[] = [];
  for (let t = range.value.min.getTime(); t <= range.value.max.getTime(); t += step) {
    out.push({
      leftPct: ((t - range.value.min.getTime()) / total) * 100,
      label: formatTick(new Date(t), granularity.value),
    });
  }
  return out;
});

function formatTick(d: Date, g: TimelineGranularity): string {
  if (g === 'hour') return `${d.getHours()}:00`;
  if (g === 'day') return `${d.getMonth() + 1}/${d.getDate()}`;
  if (g === 'week') return `W${Math.ceil(d.getDate() / 7)} ${d.getMonth() + 1}/${d.getDate()}`;
  if (g === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  if (g === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

const laneCount = computed(() =>
  placed.value.reduce((m, p) => Math.max(m, p.lane + 1), 0),
);
</script>

<template>
  <div class="timeline-layout">
    <p v-if="!startKey" class="timeline-layout__empty">
      Choose a start-date property.
    </p>
    <template v-else-if="placed.length === 0">
      <p class="timeline-layout__empty">No items with a date in range.</p>
    </template>
    <template v-else>
      <div class="timeline-layout__header">
        <span
          v-for="t in ticks"
          :key="t.leftPct"
          class="timeline-layout__tick"
          :style="{ left: `${t.leftPct}%` }"
        >{{ t.label }}</span>
      </div>
      <div class="timeline-layout__canvas" :style="{ height: `${laneCount * 28 + 16}px` }">
        <TimelineBar
          v-for="p in placed"
          :key="p.row.note.id"
          :row="p.row"
          :left-pct="p.leftPct"
          :width-pct="p.widthPct"
          :lane="p.lane"
          @open="emit('open', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.timeline-layout { height: 100%; overflow: auto; }
.timeline-layout__header {
  position: relative; height: 28px;
  border-bottom: var(--border-width-1) solid var(--border);
  background: var(--bg-soft); min-width: 800px;
}
.timeline-layout__tick {
  position: absolute; top: 6px; transform: translateX(-50%);
  font-size: 11px; color: var(--text-muted); white-space: nowrap;
}
.timeline-layout__canvas { position: relative; min-width: 800px; }
.timeline-layout__empty {
  padding: 24px; text-align: center; color: var(--text-muted);
}
</style>
