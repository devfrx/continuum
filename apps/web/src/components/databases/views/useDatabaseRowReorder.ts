/**
 * useDatabaseRowReorder — drag/drop row ordering for card-like
 * database views, built on top of the centralised `useDragAndDrop`
 * primitives.
 *
 * The composable keeps a local ordered copy for immediate visual
 * feedback, then persists the visible order through the existing
 * `POST /databases/:id/rows/reorder` endpoint. The server accepts both
 * full lists and visible subsets, so filtered/card views can reorder
 * the rows they currently render without needing the parent to pass a
 * second unfiltered row collection.
 *
 * Per-row source/target pairs are created lazily and cached by
 * `rowId`, so each card composes one `dragHandlers` + `dropHandlers`
 * map that already carries the row identity — no per-event closure
 * allocation in the template.
 */
import { ref, watch, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';
import { publishDatabaseRowsChanged } from '@/lib/realtime';
import type { DatabaseRowSnapshot } from '@continuum/shared';
import {
  DRAG_MIME,
  useDragSource,
  useDropTarget,
  type DragSourceHandlers,
  type DropTargetHandlers,
} from '@/composables/useDragAndDrop';

interface UseDatabaseRowReorderOptions {
  databaseId: ComputedRef<string>;
  rows: ComputedRef<DatabaseRowSnapshot[]>;
  editable: ComputedRef<boolean>;
  onReordered: () => void;
}

/** Tag used so other surfaces can filter against this drag's `kind`. */
const DRAG_KIND = 'database-row';

interface RowBindings {
  readonly source: { readonly isDragging: Ref<boolean>; readonly handlers: DragSourceHandlers };
  readonly target: { readonly isOver: Ref<boolean>; readonly handlers: DropTargetHandlers };
}

export function useDatabaseRowReorder(options: UseDatabaseRowReorderOptions): {
  orderedRows: Ref<DatabaseRowSnapshot[]>;
  isDraggingRow: (rowId: string) => boolean;
  isDropTargetRow: (rowId: string) => boolean;
  /** Per-row drag-source handlers — spread via `v-on`. */
  rowSourceHandlers: (row: DatabaseRowSnapshot) => DragSourceHandlers;
  /** Per-row drop-target handlers — spread via `v-on`. */
  rowTargetHandlers: (row: DatabaseRowSnapshot) => DropTargetHandlers;
  /** List-level drop handlers for the "after the last row" gutter. */
  listTargetHandlers: DropTargetHandlers;
} {
  const orderedRows = ref<DatabaseRowSnapshot[]>([]);
  const draggedRowId = ref<string | null>(null);
  const persisting = ref(false);

  watch(
    options.rows,
    (rows) => {
      if (draggedRowId.value || persisting.value) return;
      orderedRows.value = [...rows];
    },
    { immediate: true },
  );

  // ── Local immutable reorder helpers ───────────────────────────────
  //
  // Notion-style semantics:
  //   – dragging forward (source index < target index) drops the row
  //     **after** the hovered card, so the visible order changes from
  //     `[A, B, C]` → `[B, A, C]` when A is dropped on B.
  //   – dragging backward (source index > target index) drops the row
  //     **before** the hovered card, so dropping C on A produces
  //     `[C, A, B]`.
  // Without this branch the move-by-one-slot case becomes a no-op
  // because we'd splice the row back in at its original index after
  // removal — the source bug that returned `[A, B, C]` unchanged.
  function moveRelativeToTarget(
    rows: DatabaseRowSnapshot[],
    fromId: string,
    toId: string,
  ): DatabaseRowSnapshot[] {
    if (fromId === toId) return rows;
    const fromIndex = rows.findIndex((r) => r.rowId === fromId);
    const toIndex = rows.findIndex((r) => r.rowId === toId);
    if (fromIndex < 0 || toIndex < 0) return rows;
    const next = [...rows];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return rows;
    const newTargetIndex = next.findIndex((r) => r.rowId === toId);
    if (newTargetIndex < 0) return rows;
    const insertAt = fromIndex < toIndex ? newTargetIndex + 1 : newTargetIndex;
    next.splice(insertAt, 0, moved);
    return next;
  }

  function moveToEnd(rows: DatabaseRowSnapshot[], fromId: string): DatabaseRowSnapshot[] {
    const fromIndex = rows.findIndex((r) => r.rowId === fromId);
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
        next.map((r) => r.rowId),
      );
      publishDatabaseRowsChanged(options.databaseId.value);
      options.onReordered();
    } finally {
      persisting.value = false;
    }
  }

  // ── Per-row drag/drop bindings (cached per rowId) ─────────────────
  const bindings = new Map<string, RowBindings>();

  function bindingsFor(row: DatabaseRowSnapshot): RowBindings {
    const cached = bindings.get(row.rowId);
    if (cached) return cached;

    const source = useDragSource({
      mime: DRAG_MIME.rowId,
      kind: DRAG_KIND,
      disabled: () => !options.editable.value,
      getPayload: () => row.rowId,
      onStart: () => {
        draggedRowId.value = row.rowId;
      },
      onEnd: () => {
        if (draggedRowId.value === row.rowId) draggedRowId.value = null;
      },
    });

    const target = useDropTarget({
      accept: DRAG_MIME.rowId,
      acceptKind: DRAG_KIND,
      disabled: () => !options.editable.value,
      autoscroll: { edge: 56 },
      onDrop: async (payload) => {
        if (!payload || payload === row.rowId) return;
        const previous = [...orderedRows.value];
        const next = moveRelativeToTarget(previous, payload, row.rowId);
        if (next === previous) return;
        try {
          await persist(next);
        } catch (err) {
          orderedRows.value = previous;
          throw err;
        }
      },
    });

    const entry: RowBindings = {
      source: { isDragging: source.isDragging, handlers: source.dragHandlers },
      target: { isOver: target.isOver, handlers: target.dropHandlers },
    };
    bindings.set(row.rowId, entry);
    return entry;
  }

  function isDraggingRow(rowId: string): boolean {
    return draggedRowId.value === rowId;
  }

  function isDropTargetRow(rowId: string): boolean {
    const entry = bindings.get(rowId);
    return entry?.target.isOver.value === true && draggedRowId.value !== rowId;
  }

  // ── List-level "drop after the last row" target ───────────────────
  const listTarget = useDropTarget({
    accept: DRAG_MIME.rowId,
    acceptKind: DRAG_KIND,
    disabled: () => !options.editable.value,
    autoscroll: { edge: 56 },
    onDrop: async (payload, event) => {
      // Cards (which install their own drop targets) stop propagation
      // so this list-level callback only fires for drops that landed in
      // the gutter outside any card — the "move to end" case.
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-row-drop-target="true"]')) return;
      if (!payload) return;
      const previous = [...orderedRows.value];
      const next = moveToEnd(previous, payload);
      if (next === previous) return;
      try {
        await persist(next);
      } catch (err) {
        orderedRows.value = previous;
        throw err;
      }
    },
  });

  return {
    orderedRows,
    isDraggingRow,
    isDropTargetRow,
    rowSourceHandlers: (row) => bindingsFor(row).source.handlers,
    rowTargetHandlers: (row) => bindingsFor(row).target.handlers,
    listTargetHandlers: listTarget.dropHandlers,
  };
}
