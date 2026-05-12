<script setup lang="ts">
/**
 * TimelineBar — single horizontal bar inside {@link TimelineLayout}.
 *
 * Width and offset are pre-computed by the parent and passed in as
 * percentages so the bar is purely presentational. Click → `open(noteId)`.
 */
import type { NoteWithProperties } from '@continuum/shared';

const props = defineProps<{
  row: NoteWithProperties;
  /** Left offset, percentage of the timeline canvas (0 → 100). */
  leftPct: number;
  /** Width, percentage of the timeline canvas (0 → 100). */
  widthPct: number;
  /** Vertical lane index (0 = top). */
  lane: number;
}>();

const emit = defineEmits<{ (e: 'open', noteId: string): void }>();
</script>

<template>
  <button
    type="button"
    class="timeline-bar"
    :style="{
      left: `${props.leftPct}%`,
      width: `${Math.max(props.widthPct, 0.5)}%`,
      top: `${props.lane * 28 + 4}px`,
    }"
    :title="props.row.note.title"
    @click="emit('open', props.row.note.id)"
  >{{ props.row.note.title || 'Untitled' }}</button>
</template>

<style scoped>
.timeline-bar {
  position: absolute; height: 22px; padding: 0 8px;
  background: var(--accent, var(--text-muted)); color: var(--bg);
  border: none; border-radius: 4px; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer; text-align: left;
}
.timeline-bar:hover { filter: brightness(1.1); }
</style>
