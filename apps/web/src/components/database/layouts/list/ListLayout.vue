<script setup lang="ts">
/**
 * ListLayout — a single vertical list of notes.
 *
 * Renders one row per `NoteWithProperties`: the note title (large) followed
 * by inline meta chips for each property key listed in
 * `view.layout.showProperties`. Click → `open(noteId)`.
 *
 * Skeleton: hover highlight only; no inline editing, no virtualisation.
 */
import { computed } from 'vue';
import type {
  DatabaseView,
  NoteWithProperties,
  QueryGroupBucket,
} from '@continuum/shared';
import { useProperties } from '@/composables/useProperties';
import {
  findPropertyDefinition,
  findPropertyValue,
  formatPropertyValue,
} from '../_shared/propertyHelpers';

const props = defineProps<{
  view: DatabaseView | null;
  rows: NoteWithProperties[];
  groups: QueryGroupBucket[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reloadRow: (noteId: string) => Promise<void>;
}>();

const emit = defineEmits<{ (e: 'open', noteId: string): void }>();

const properties = useProperties();
const defs = computed(() =>
  props.view?.kindId ? properties.forKind(props.view.kindId) : [],
);

const showKeys = computed<string[]>(() => {
  if (props.view?.layout.type !== 'list') return [];
  return props.view.layout.showProperties;
});

interface Chip { key: string; label: string; text: string }

function chipsFor(row: NoteWithProperties): Chip[] {
  return showKeys.value.flatMap((key) => {
    const def = findPropertyDefinition(defs.value, key);
    if (!def) return [];
    const text = formatPropertyValue(findPropertyValue(row, key));
    if (!text) return [];
    return [{ key, label: def.label, text }];
  });
}
</script>

<template>
  <div class="list-layout">
    <ul class="list-layout__items">
      <li
        v-for="row in props.rows"
        :key="row.note.id"
        class="list-layout__item"
        @click="emit('open', row.note.id)"
      >
        <span class="list-layout__title">{{ row.note.title || 'Untitled' }}</span>
        <span class="list-layout__chips">
          <span
            v-for="chip in chipsFor(row)"
            :key="chip.key"
            class="list-layout__chip"
            :title="chip.label"
          >{{ chip.text }}</span>
        </span>
      </li>
    </ul>
    <div v-if="props.hasMore" class="list-layout__more">
      <button type="button" :disabled="props.loading" @click="props.loadMore()">
        {{ props.loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
    <p v-if="!props.loading && props.rows.length === 0" class="list-layout__empty">
      No items yet.
    </p>
  </div>
</template>

<style scoped>
.list-layout { padding: 8px 0; overflow-y: auto; height: 100%; }
.list-layout__items { list-style: none; margin: 0; padding: 0; }
.list-layout__item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 10px 16px; cursor: pointer;
  border-bottom: var(--border-width-1) solid var(--border);
  color: var(--text);
}
.list-layout__item:hover { background: var(--bg-soft); }
.list-layout__title { font-size: 15px; font-weight: 500; }
.list-layout__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.list-layout__chip {
  font-size: 12px; padding: 2px 8px; border-radius: 999px;
  background: var(--bg-soft); color: var(--text-muted);
  border: var(--border-width-1) solid var(--border);
}
.list-layout__more { padding: 12px 16px; text-align: center; }
.list-layout__empty {
  padding: 24px; text-align: center; color: var(--text-muted);
}
</style>
