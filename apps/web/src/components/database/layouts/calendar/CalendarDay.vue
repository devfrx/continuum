<script setup lang="ts">
/**
 * CalendarDay — single day cell rendered inside {@link CalendarLayout}.
 *
 * Shows the day number and up to N event chips. Extra events collapse
 * to a "+N more" indicator. Clicking a chip emits `open(noteId)`.
 */
import type { NoteWithProperties } from '@continuum/shared';

const MAX_VISIBLE = 3;

const props = defineProps<{
  date: Date;
  inMonth: boolean;
  events: NoteWithProperties[];
}>();

const emit = defineEmits<{ (e: 'open', noteId: string): void }>();
</script>

<template>
  <div class="cal-day" :class="{ 'cal-day--out': !props.inMonth }">
    <span class="cal-day__num">{{ props.date.getDate() }}</span>
    <ul class="cal-day__events">
      <li
        v-for="row in props.events.slice(0, MAX_VISIBLE)"
        :key="row.note.id"
        class="cal-day__chip"
        :title="row.note.title"
        @click.stop="emit('open', row.note.id)"
      >{{ row.note.title || 'Untitled' }}</li>
      <li v-if="props.events.length > MAX_VISIBLE" class="cal-day__more">
        +{{ props.events.length - MAX_VISIBLE }} more
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cal-day {
  border-right: var(--border-width-1) solid var(--border);
  border-bottom: var(--border-width-1) solid var(--border);
  padding: 4px; min-height: 96px;
  display: flex; flex-direction: column; gap: 4px;
  background: var(--bg);
}
.cal-day--out { background: var(--bg-soft); color: var(--text-muted); }
.cal-day__num { font-size: 12px; font-weight: 500; }
.cal-day__events { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.cal-day__chip {
  font-size: 11px; padding: 2px 6px; border-radius: 4px;
  background: var(--bg-elev); color: var(--text); cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-day__chip:hover { background: var(--accent, var(--text-muted)); color: var(--bg); }
.cal-day__more { font-size: 11px; color: var(--text-muted); padding: 0 6px; }
</style>
