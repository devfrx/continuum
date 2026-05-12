<script setup lang="ts">
/**
 * `TableRow` — one note row in the database table.
 *
 * Lays out the frozen title cell, one `TableCell` per visible property
 * column, and a trailing spacer that aligns with the header's "+" cell.
 * Adds a left-side drag handle (reorder hooks for a future milestone),
 * hover highlight matching `PropertyRow.vue`, and a right-click context
 * menu wired to delete the underlying note.
 */
import { onBeforeUnmount, ref } from 'vue';
import type { NoteWithProperties } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';
import type { ResolvedColumn } from './useTableColumns';
import TableCell from './TableCell.vue';
import TableTitleCell from './TableTitleCell.vue';

const props = defineProps<{
  row: NoteWithProperties;
  columns: ResolvedColumn[];
  selected?: boolean;
  /**
   * Map of `propertyKey -> sticky-left-px` for frozen columns. Cells
   * whose key is in the map render with `position: sticky; left: <px>`.
   */
  frozenOffsets?: Map<string, number>;
}>();

const emit = defineEmits<{
  open: [noteId: string];
  removed: [noteId: string];
  mutated: [noteId: string];
  select: [event: { noteId: string; shift: boolean }];
  'drag-start': [event: DragEvent];
  'drag-over': [event: DragEvent];
  drop: [event: DragEvent];
}>();

const menu = ref<{ x: number; y: number } | null>(null);

function valueFor(propertyKey: string) {
  const entry = props.row.properties.find((p) => p.definition.key === propertyKey);
  return entry?.value ?? null;
}

/** Sticky-left offset for a column key, or `null` when not frozen. */
function frozenLeftOf(propertyKey: string): number | null {
  const v = props.frozenOffsets?.get(propertyKey);
  return v == null ? null : v;
}

function onContextMenu(event: MouseEvent): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY };
  queueMicrotask(() => document.addEventListener('mousedown', closeMenu));
}

function closeMenu(): void {
  menu.value = null;
  document.removeEventListener('mousedown', closeMenu);
}

async function onDelete(): Promise<void> {
  closeMenu();
  await api.notes.remove(props.row.note.id);
  emit('removed', props.row.note.id);
}

function onOpen(): void {
  closeMenu();
  emit('open', props.row.note.id);
}

/** Wired in M-future (row duplication); kept emit-free until then. */
function onDuplicate(): void {
  closeMenu();
}

function onRowClick(event: MouseEvent): void {
  if (event.shiftKey) emit('select', { noteId: props.row.note.id, shift: true });
}

onBeforeUnmount(() => document.removeEventListener('mousedown', closeMenu));
</script>

<template>
  <div
    class="t-row"
    :class="{ 'is-selected': selected }"
    @contextmenu="onContextMenu"
    @click="onRowClick"
  >
    <div class="t-row__handle-wrap">
      <button
        type="button"
        class="t-row__handle"
        title="Drag to reorder"
        aria-label="Drag row"
        draggable="true"
        @dragstart.stop="emit('drag-start', $event)"
        @dragover.prevent="emit('drag-over', $event)"
        @drop="emit('drop', $event)"
      >
        <Icon name="drag" :size="11" />
      </button>
    </div>

    <TableTitleCell
      :note-id="row.note.id"
      :title="row.note.title"
      @open="emit('open', $event)"
      @renamed="emit('mutated', $event)"
    />

    <TableCell
      v-for="col in columns"
      :key="col.definition.id"
      :note-id="row.note.id"
      :definition="col.definition"
      :value="valueFor(col.definition.key)"
      :frozen-left="frozenLeftOf(col.definition.key)"
      :wrap="col.column.wrap"
      @mutated="emit('mutated', $event)"
      @select="emit('open', $event)"
    />

    <div class="t-row__pad" />

    <ul v-if="menu" class="t-row__menu" :style="{ top: `${menu.y}px`, left: `${menu.x}px` }">
      <li><button type="button" @click="onOpen">Open</button></li>
      <li><button type="button" @click="onDuplicate">Duplicate</button></li>
      <li>
        <button type="button" class="is-danger" @click="onDelete">Delete</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.t-row { display: contents; }
.t-row__handle-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  position: sticky;
  left: 0;
  background: var(--bg);
  border-bottom: var(--border-width-1) solid var(--border);
}
.t-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  border-radius: var(--radius-sm);
  cursor: grab;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}
.t-row:hover .t-row__handle { opacity: 1; }
.t-row__pad { border-bottom: var(--border-width-1) solid var(--border); }
.t-row__menu {
  position: fixed;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--bg);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.28);
  z-index: 1000;
  min-width: 160px;
}
.t-row__menu button {
  display: block;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  text-align: left;
  color: var(--fg);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.t-row__menu button:hover { background: color-mix(in srgb, var(--bg-soft) 60%, transparent); }
.t-row__menu .is-danger { color: var(--danger, #d6534b); }
</style>
