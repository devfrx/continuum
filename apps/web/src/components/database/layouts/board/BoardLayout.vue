<script setup lang="ts">
/**
 * BoardLayout — Notion-style kanban view.
 *
 * Columns are derived from the property identified by
 * `view.layout.groupByPropertyKey`:
 *   - `select` / `status`  → one column per option (+ "No value")
 *   - `multiSelect`        → card appears in every selected option's column
 *   - `checkbox`           → "Done" / "To do"
 *
 * Drag-and-drop between columns is intentionally a stub: the card click
 * still navigates, while a future M will wire the `move` emit to the
 * server. Today the emit is unused — kept on the contract for forward
 * compatibility.
 */
import { computed } from 'vue';
import type {
  CardSize,
  DatabaseView,
  NoteWithProperties,
  PropertyDefinition,
  PropertyValue,
  QueryGroupBucket,
} from '@continuum/shared';
import { useProperties } from '@/composables/useProperties';
import {
  findPropertyDefinition,
  findPropertyValue,
} from '../_shared/propertyHelpers';
import BoardCard from './BoardCard.vue';

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
  (e: 'move', noteId: string, newGroupValue: string | null): void;
}>();

const properties = useProperties();
const defs = computed(() =>
  props.view?.kindId ? properties.forKind(props.view.kindId) : [],
);

const groupKey = computed<string>(() =>
  props.view?.layout.type === 'board' ? props.view.layout.groupByPropertyKey : '',
);
const coverKey = computed<string | undefined>(() =>
  props.view?.layout.type === 'board' ? props.view.layout.coverPropertyKey : undefined,
);
const cardSize = computed<CardSize>(() =>
  props.view?.layout.type === 'board' ? props.view.layout.cardSize : 'medium',
);

interface Column { id: string; label: string; rows: NoteWithProperties[] }

const columns = computed<Column[]>(() => {
  const def = findPropertyDefinition(defs.value, groupKey.value);
  if (!def) return [];
  const buckets = buildBuckets(def);
  for (const row of props.rows) {
    const value = findPropertyValue(row, groupKey.value);
    for (const id of bucketIdsFor(def, value)) {
      const col = buckets.find((b) => b.id === id);
      if (col) col.rows.push(row);
    }
  }
  return buckets;
});

function buildBuckets(def: PropertyDefinition): Column[] {
  if (def.type === 'checkbox') {
    return [
      { id: 'true', label: 'Done', rows: [] },
      { id: 'false', label: 'To do', rows: [] },
    ];
  }
  if ((def.type === 'select' || def.type === 'multiSelect' || def.type === 'status') &&
      'options' in def.config) {
    const cols: Column[] = def.config.options.map((o) => ({
      id: o.id, label: o.label, rows: [],
    }));
    cols.push({ id: '__empty__', label: 'No value', rows: [] });
    return cols;
  }
  return [{ id: '__empty__', label: 'No value', rows: [] }];
}

function bucketIdsFor(def: PropertyDefinition, value: PropertyValue | null): string[] {
  if (def.type === 'checkbox') {
    return [value && value.type === 'checkbox' && value.value ? 'true' : 'false'];
  }
  if (!value) return ['__empty__'];
  if (value.type === 'select' || value.type === 'status') return [value.value || '__empty__'];
  if (value.type === 'multiSelect') {
    return value.value.length ? value.value : ['__empty__'];
  }
  return ['__empty__'];
}
</script>

<template>
  <div class="board-layout">
    <p v-if="!groupKey" class="board-layout__empty">
      Choose a property to group by.
    </p>
    <div v-else class="board-layout__cols">
      <section
        v-for="col in columns"
        :key="col.id"
        class="board-col"
        @dragover.prevent
        @drop="emit('move', '', col.id === '__empty__' ? null : col.id)"
      >
        <header class="board-col__header">
          <span class="board-col__title">{{ col.label }}</span>
          <span class="board-col__count">{{ col.rows.length }}</span>
        </header>
        <div class="board-col__cards">
          <BoardCard
            v-for="row in col.rows"
            :key="row.note.id + ':' + col.id"
            :row="row"
            :defs="defs"
            :cover-key="coverKey"
            :group-key="groupKey"
            :density="cardSize"
            draggable="true"
            @open="emit('open', $event)"
          />
        </div>
      </section>
    </div>
    <div v-if="props.hasMore" class="board-layout__more">
      <button type="button" :disabled="props.loading" @click="props.loadMore()">
        {{ props.loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.board-layout { height: 100%; display: flex; flex-direction: column; }
.board-layout__cols {
  flex: 1; display: flex; gap: 12px; padding: 12px;
  overflow-x: auto; align-items: flex-start;
}
.board-col {
  flex: 0 0 280px; max-height: 100%;
  background: var(--bg-soft); border: var(--border-width-1) solid var(--border);
  border-radius: 8px; display: flex; flex-direction: column;
}
.board-col__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: var(--border-width-1) solid var(--border);
}
.board-col__title { font-weight: 600; color: var(--text); font-size: 13px; }
.board-col__count { color: var(--text-muted); font-size: 12px; }
.board-col__cards {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px; overflow-y: auto;
}
.board-layout__empty, .board-layout__more {
  padding: 16px; text-align: center; color: var(--text-muted);
}
</style>
