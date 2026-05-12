<script setup lang="ts">
/**
 * `TableLayout` — orchestrator for the database "Table" view.
 *
 * Owns the CSS grid that aligns header / row cells column-by-column,
 * drives uniform-height windowed virtualization via `useVirtualRows`,
 * and tracks Shift-click row selection. Group headers + the calc footer
 * are derived through {@link useTableBlocks}.
 *
 * **Note:** virtualization is disabled while groups are active because
 * variable-height header rows would break the uniform-pitch math; this
 * is acceptable for v1 (M+ revisits a heterogenous virtualizer).
 */
import { computed, ref } from 'vue';
import type {
  CalcFn, CalcFnResult, DatabaseView, NoteWithProperties, QueryGroupBucket,
} from '@continuum/shared';
import { api } from '@/api';
import { useTableColumns } from './useTableColumns';
import { useVirtualRows } from './useVirtualRows';
import { useTableBlocks } from './useTableBlocks';
import {
  ROW_HEIGHT_PX, HEADER_HEIGHT_PX, buildGridTemplate, computeFrozenOffsets,
} from './tableGrid';
import { applyColumnAction } from './applyColumnAction';
import TableHeader from './TableHeader.vue';
import type { ColumnActionPayload } from './TableHeaderCell.vue';
import TableRow from './TableRow.vue';
import TableNewRow from './TableNewRow.vue';
import TableBulkBar from './TableBulkBar.vue';
import TableGroupHeader from './TableGroupHeader.vue';
import TableCalcRow from './TableCalcRow.vue';

const props = defineProps<{
  view: DatabaseView | null;
  rows: NoteWithProperties[];
  groups?: QueryGroupBucket[];
  calc?: Record<string, CalcFnResult>;
  total?: number;
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reloadRow: (noteId: string) => Promise<void>;
  /** Persist a partial view mutation (debounced PATCH on the server). */
  patch: (delta: Partial<DatabaseView>) => Promise<void>;
}>();

const emit = defineEmits<{
  open: [noteId: string];
  removed: [noteId: string];
  created: [];
  'property-created': [];
}>();

const viewRef = computed(() => props.view);
const calcRef = computed<Record<string, CalcFnResult>>(() => props.calc ?? {});
const kindId = computed<string>(() => props.view?.kindId ?? '');
const { columns, materialized } = useTableColumns(viewRef, kindId);

const rowHeight = computed<number>(() => {
  const preset = props.view?.layout.type === 'table' ? props.view.layout.rowHeight : 'medium';
  return ROW_HEIGHT_PX[preset];
});
const gridTemplate = computed(() => buildGridTemplate(columns.value));
const frozenOffsets = computed(() => computeFrozenOffsets(columns.value));

const { blocks, hasCalc, disableVirtual, toggleCollapsed } = useTableBlocks({
  view: viewRef,
  rows: computed(() => props.rows),
  groups: computed(() => props.groups),
  calc: calcRef,
});

const { scroller, sentinel, window: virtWindow, onScroll } = useVirtualRows({
  totalRef: computed(() => (disableVirtual.value ? 0 : props.rows.length)),
  rowHeightRef: rowHeight,
  hasMoreRef: computed(() => props.hasMore),
  loadingRef: computed(() => props.loading),
  loadMore: () => props.loadMore(),
});

const visibleBlocks = computed(() =>
  disableVirtual.value
    ? blocks.value
    : blocks.value.slice(virtWindow.value.start, virtWindow.value.end),
);

// ─── Selection / bulk delete ────────────────────────────────────────
const selectedIds = ref<Set<string>>(new Set());

function toggleSelect(noteId: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(noteId)) next.delete(noteId);
  else next.add(noteId);
  selectedIds.value = next;
}
function clearSelection(): void { selectedIds.value = new Set(); }

async function deleteSelected(): Promise<void> {
  const ids = [...selectedIds.value];
  clearSelection();
  await Promise.all(ids.map((id) => api.notes.remove(id)));
  for (const id of ids) emit('removed', id);
}

async function onMutated(noteId: string): Promise<void> { await props.reloadRow(noteId); }
function onRemoved(noteId: string): void {
  selectedIds.value.delete(noteId);
  emit('removed', noteId);
}

/** Forward header column actions to {@link applyColumnAction}. */
async function onColumnAction(payload: ColumnActionPayload): Promise<void> {
  if (!props.view) return;
  await applyColumnAction(props.view, materialized.value, payload, props.patch);
}

/** Persist a calc-row picker selection into the view's `calculation` map. */
async function onCalcSelect(p: { propertyKey: string; fn: CalcFn }): Promise<void> {
  if (!props.view) return;
  await props.patch({ calculation: { ...props.view.calculation, [p.propertyKey]: p.fn } });
}
</script>

<template>
  <div class="t-layout">
    <TableBulkBar v-if="selectedIds.size > 0" :count="selectedIds.size"
      @clear="clearSelection" @delete="deleteSelected" />

    <div ref="scroller" class="t-layout__scroll" @scroll="onScroll">
      <div class="t-layout__grid" :style="{
        gridTemplateColumns: gridTemplate,
        '--row-h': `${rowHeight}px`,
        '--head-h': `${HEADER_HEIGHT_PX}px`,
      }">
        <div class="t-layout__corner" />
        <TableHeader :kind-id="kindId" :columns="columns" :frozen-offsets="frozenOffsets"
          @column-action="onColumnAction" @property-created="emit('property-created')" />

        <div v-if="virtWindow.padTop > 0" class="t-layout__pad" :style="{ height: `${virtWindow.padTop}px` }" />
        <template v-for="(block, i) in visibleBlocks"
          :key="block.kind === 'row' ? block.row.note.id : `g:${i}`">
          <TableGroupHeader v-if="block.kind === 'group-header'"
            :bucket="block.bucket" :collapsed="block.collapsed" @toggle="toggleCollapsed" />
          <TableRow v-else :row="block.row" :columns="columns" :frozen-offsets="frozenOffsets"
            :selected="selectedIds.has(block.row.note.id)"
            @open="emit('open', $event)" @removed="onRemoved" @mutated="onMutated"
            @select="toggleSelect($event.noteId)" />
        </template>
        <div v-if="virtWindow.padBottom > 0" class="t-layout__pad" :style="{ height: `${virtWindow.padBottom}px` }" />

        <TableNewRow v-if="kindId" class="t-layout__new" :kind-id="kindId" @created="emit('created')" />

        <TableCalcRow v-if="hasCalc && calc" :columns="columns" :calc="calc"
          :frozen-offsets="frozenOffsets" :total="total" @select="onCalcSelect" />

        <div ref="sentinel" class="t-layout__sentinel" aria-hidden="true" />
      </div>

      <div v-if="rows.length === 0 && !loading" class="t-layout__empty">
        No rows. Add the first one to begin.
      </div>
    </div>
  </div>
</template>

<style scoped>
.t-layout {
  display: flex; flex-direction: column;
  height: 100%; width: 100%;
  position: relative;
}
.t-layout__scroll { flex: 1 1 auto; overflow: auto; position: relative; }
.t-layout__grid {
  display: grid;
  grid-auto-rows: var(--row-h);
  width: max-content;
  min-width: 100%;
}
.t-layout__corner {
  height: var(--head-h);
  position: sticky; top: 0; left: 0;
  z-index: 4;
  background: var(--bg);
  border-right: var(--border-width-1) solid var(--border);
  border-bottom: var(--border-width-1) solid var(--border);
  grid-column: 1; grid-row: 1;
}
.t-layout__pad { grid-column: 1 / -1; }
.t-layout__sentinel { height: 1px; grid-column: 1 / -1; }
:deep(.t-layout__new) { grid-column: 1 / -1; }
.t-layout__empty {
  position: absolute;
  inset: var(--head-h, 36px) 0 0 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--fg-muted);
  pointer-events: none;
  font-size: var(--text-sm);
}
</style>
