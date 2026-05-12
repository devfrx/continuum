<script setup lang="ts">
/**
 * BoardCard — single card used by {@link BoardLayout}.
 *
 * Renders the note title, an optional cover image (from the board's
 * `coverPropertyKey`) and a chip list of the remaining property values.
 */
import type {
  NoteWithProperties,
  PropertyDefinition,
} from '@continuum/shared';
import {
  coverImageUrl,
  findPropertyValue,
  formatPropertyValue,
} from '../_shared/propertyHelpers';

const props = defineProps<{
  row: NoteWithProperties;
  defs: PropertyDefinition[];
  coverKey: string | undefined;
  groupKey: string;
  density: 'small' | 'medium' | 'large';
}>();

const emit = defineEmits<{ (e: 'open', noteId: string): void }>();

function url(): string | null {
  return coverImageUrl(props.row, props.coverKey, props.defs);
}

function chips(): { key: string; label: string; text: string }[] {
  return props.defs
    .filter((d) => d.key !== props.coverKey && d.key !== props.groupKey)
    .flatMap((d) => {
      const text = formatPropertyValue(findPropertyValue(props.row, d.key));
      return text ? [{ key: d.key, label: d.label, text }] : [];
    })
    .slice(0, 4);
}
</script>

<template>
  <article
    class="board-card"
    :class="`board-card--${props.density}`"
    @click="emit('open', props.row.note.id)"
  >
    <div
      v-if="url()"
      class="board-card__cover"
      :style="{ backgroundImage: `url(${url()})` }"
    />
    <h4 class="board-card__title">{{ props.row.note.title || 'Untitled' }}</h4>
    <div v-if="chips().length" class="board-card__chips">
      <span
        v-for="c in chips()"
        :key="c.key"
        class="board-card__chip"
        :title="c.label"
      >{{ c.text }}</span>
    </div>
  </article>
</template>

<style scoped>
.board-card {
  background: var(--bg); border: var(--border-width-1) solid var(--border);
  border-radius: 6px; padding: 8px 10px; cursor: pointer;
  display: flex; flex-direction: column; gap: 6px;
}
.board-card:hover { border-color: var(--accent, var(--text-muted)); }
.board-card--small { padding: 6px 8px; }
.board-card--large { padding: 12px 14px; gap: 10px; }
.board-card__cover {
  height: 80px; border-radius: 4px;
  background-size: cover; background-position: center;
  background-color: var(--bg-elev);
}
.board-card--large .board-card__cover { height: 120px; }
.board-card__title { margin: 0; font-size: 13px; font-weight: 600; color: var(--text); }
.board-card--large .board-card__title { font-size: 14px; }
.board-card__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.board-card__chip {
  font-size: 11px; padding: 1px 6px; border-radius: 4px;
  background: var(--bg-soft); color: var(--text-muted);
}
</style>
