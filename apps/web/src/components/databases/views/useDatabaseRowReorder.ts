/**
 * useDatabaseRowReorder — native drag/drop row ordering for card-like
 * database views.
 *
 * The composable keeps a local ordered copy for immediate visual
 * feedback, then persists the visible order through the existing
 * `POST /databases/:id/rows/reorder` endpoint. The server accepts both
 * full lists and visible subsets, so filtered/card views can reorder
 * the rows they currently render without needing the parent to pass a
 * second unfiltered row collection.
 */
import { ref, watch, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';
import { publishDatabaseRowsChanged } from '@/lib/realtime';
import type { DatabaseRowSnapshot } from '@continuum/shared';

interface UseDatabaseRowReorderOptions {
  databaseId: ComputedRef<string>;
  rows: ComputedRef<DatabaseRowSnapshot[]>;
  editable: ComputedRef<boolean>;
  onReordered: () => void;
}

export function useDatabaseRowReorder(options: UseDatabaseRowReorderOptions): {
  orderedRows: Ref<DatabaseRowSnapshot[]>;
  draggedRowId: Ref<string | null>;
  dropTargetRowId: Ref<string | null>;
  isDraggingRow: (rowId: string) => boolean;
  isDropTargetRow: (rowId: string) => boolean;
  onRowDragStart: (event: DragEvent, row: DatabaseRowSnapshot) => void;
  onRowDragOver: (event: DragEvent, row: DatabaseRowSnapshot) => void;
  onRowDrop: (event: DragEvent, row: DatabaseRowSnapshot) => Promise<void>;
  onListDragOver: (event: DragEvent) => void;
  onListDropEnd: (event: DragEvent) => Promise<void>;
  clearDragState: () => void;
} {
  const orderedRows = ref<DatabaseRowSnapshot[]>([]);
  const draggedRowId = ref<string | null>(null);
  const dropTargetRowId = ref<string | null>(null);
  const persisting = ref(false);

  watch(
    options.rows,
    (rows) => {
      if (draggedRowId.value || persisting.value) return;
      orderedRows.value = [...rows];
    },
    { immediate: true },
  );

  function moveBefore(
    rows: DatabaseRowSnapshot[],
    fromId: string,
    toId: string,
  ): DatabaseRowSnapshot[] {
    const fromIndex = rows.findIndex((row) => row.rowId === fromId);
    const toIndex = rows.findIndex((row) => row.rowId === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return rows;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return rows;
    const insertAt = next.findIndex((row) => row.rowId === toId);
    next.splice(insertAt < 0 ? next.length : insertAt, 0, moved);
    return next;
  }

  function moveToEnd(rows: DatabaseRowSnapshot[], fromId: string): DatabaseRowSnapshot[] {
    const fromIndex = rows.findIndex((row) => row.rowId === fromId);
    if (fromIndex < 0 || fromIndex === rows.length - 1) return rows;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    if (moved) next.push(moved);
    return next;
  }

  async function persist(next: DatabaseRowSnapshot[]): Promise<void> {
    persisting.value = true;
    orderedRows.value = next;
    try {
      await api.databases.rows.reorder(
        options.databaseId.value,
        next.map((row) => row.rowId),
      );
      publishDatabaseRowsChanged(options.databaseId.value);
      options.onReordered();
    } finally {
      persisting.value = false;
    }
  }

  function rowIdFromEvent(event: DragEvent): string | null {
    return event.dataTransfer?.getData('text/plain') || draggedRowId.value;
  }

  function onRowDragStart(event: DragEvent, row: DatabaseRowSnapshot): void {
    if (!options.editable.value) return;
    event.stopPropagation();
    draggedRowId.value = row.rowId;
    dropTargetRowId.value = row.rowId;
    event.dataTransfer?.setData('text/plain', row.rowId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function onRowDragOver(event: DragEvent, row: DatabaseRowSnapshot): void {
    if (!options.editable.value || !draggedRowId.value) return;
    event.preventDefault();
    event.stopPropagation();
    dropTargetRowId.value = row.rowId;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async function onRowDrop(event: DragEvent, row: DatabaseRowSnapshot): Promise<void> {
    if (!options.editable.value) return;
    event.preventDefault();
    event.stopPropagation();
    const fromId = rowIdFromEvent(event);
    clearDragState();
    if (!fromId || fromId === row.rowId) return;
    const previous = [...orderedRows.value];
    const next = moveBefore(previous, fromId, row.rowId);
    if (next === previous) return;
    try {
      await persist(next);
    } catch (err) {
      orderedRows.value = previous;
      throw err;
    }
  }

  function onListDragOver(event: DragEvent): void {
    if (!options.editable.value || !draggedRowId.value) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  async function onListDropEnd(event: DragEvent): Promise<void> {
    if (!options.editable.value) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-row-drop-target="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    const fromId = rowIdFromEvent(event);
    clearDragState();
    if (!fromId) return;
    const previous = [...orderedRows.value];
    const next = moveToEnd(previous, fromId);
    if (next === previous) return;
    try {
      await persist(next);
    } catch (err) {
      orderedRows.value = previous;
      throw err;
    }
  }

  function isDraggingRow(rowId: string): boolean {
    return draggedRowId.value === rowId;
  }

  function isDropTargetRow(rowId: string): boolean {
    return dropTargetRowId.value === rowId && draggedRowId.value !== rowId;
  }

  function clearDragState(): void {
    draggedRowId.value = null;
    dropTargetRowId.value = null;
  }

  return {
    orderedRows,
    draggedRowId,
    dropTargetRowId,
    isDraggingRow,
    isDropTargetRow,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onListDragOver,
    onListDropEnd,
    clearDragState,
  };
}
